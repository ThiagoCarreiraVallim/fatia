"""O runner do eval da fronteira de tools (`docs/eval-fronteira-de-tools.md`).

    uv run python -m fatia_agent.eval.run_fronteira rodar \\
      --braco A --split dev \\
      --base-url https://openrouter.ai/api/v1 --modelo google/gemma-4-31b-it \\
      --chat-extra '{"provider":{"order":["deepinfra"],"allow_fallbacks":false},"temperature":1}' \\
      --saida /tmp/fronteira-a-dev

    uv run python -m fatia_agent.eval.run_fronteira comparar /tmp/fronteira-a /tmp/fronteira-b

**O caminho de conversa é o do produto.** O mesmo grafo (`stream_chat_events`),
o mesmo prompt, o mesmo recorte de três camadas, o mesmo `/mcp` com o mesmo JWT.
O que o runner faz por fora é o que a pessoa faria na tela: aprovar a proposta,
num turno "Confirmar" com a conversa anterior no histórico — como
`use-chat-stream.ts` monta.

**O provedor não é o do produto, e esta é a única exceção.** O
`OpenAICompatProvider` recusa endpoint remoto fora de `allowed_models.py`, e as
listas nascem vazias de propósito (#136): elas protegem o dado de saúde de gente
de verdade. O eval só conversa como as contas de avaliação, cujos dados são
sintéticos (`packages/db/prisma/seed-eval.ts`), e o `TokensDeAvaliacao` recusa
token de qualquer outra conta. `ProvedorDoEval` pula a revisão de destino por
isso, e só por isso: ele não é importado fora deste módulo, e o
`tests/eval/test_run_fronteira.py` reprova quem o importar do caminho do produto.

Três recusas, todas para o número valer:

- **agregador sem provedor fixo**: no OpenRouter o mesmo nome de modelo roda em
  provedores com quantização diferente, e trocar de provedor no meio da rodada é
  trocar de modelo sem registro;
- **catálogo do braço errado**: o braço B depende de um header que a API ainda
  pode não conhecer — e aí ela serve o braço A em silêncio, e o "B" mediria o A;
- **`eval` repetido**: o ledger em `eval/fronteira-runs.jsonl` recusa a mesma
  configuração duas vezes. A configuração inclui o `sha256` do catálogo servido,
  então ajustar uma descrição do braço B é configuração nova, e aparece no diff.
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import hashlib
import json
import os
import shlex
import sys
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx

from ..chat import McpClient, McpToolInfo, stream_chat_events, todas_permitidas
from ..chat.errors import McpError
from ..prompts import chat_pt_br
from ..providers.base import ToolChatCapability
from ..providers.errors import AIProviderNotConfigured
from ..providers.openai_compat import OpenAICompatProvider
from .contas import ContaDeAvaliacaoError, TokensDeAvaliacao
from .fronteira_comparador import (
    CabecalhoDaRodada,
    Chamada,
    Execucao,
    ResultadoDaTarefa,
    agrupar,
    markdown_da_comparacao,
    markdown_do_braco,
    motivo_de_rascunho,
)
from .fronteira_tarefas import TAREFAS_PADRAO, Braco, Tarefa, carregar, impressao_digital

DIRETORIO_PADRAO = Path(__file__).resolve().parents[3] / "eval"
RAIZ_DO_REPO = Path(__file__).resolve().parents[5]

HEADER_SUPERFICIE = "x-fatia-superficie"
SUPERFICIE: Mapping[Braco, str | None] = {"A": None, "B": "intencao"}

#: Turnos de aprovação por tarefa. Uma composição de escrita no braço A pode pedir
#: mais de uma confirmação em sequência; acima disto, é o modelo em laço.
MAXIMO_DE_APROVACOES = 3

AGREGADORES = frozenset({"openrouter.ai"})


class ConfiguracaoRecusada(Exception):
    """A rodada não começa: o número sairia medindo outra coisa."""


class ProvedorDoEval(OpenAICompatProvider):
    """`OpenAICompatProvider` sem a revisão de destino da #136. Ver o docstring do módulo."""

    def _require_model(self, capability: str, model: str) -> str:
        if not model.strip():
            raise AIProviderNotConfigured(f"O eval precisa de um modelo de {capability}.")
        return model


def exigir_provedor_fixo(base_url: str, chat_extra: Mapping[str, Any]) -> None:
    host = urlparse(base_url).hostname or ""
    if host not in AGREGADORES:
        return
    roteamento = chat_extra.get("provider")
    fixo = (
        isinstance(roteamento, dict)
        and roteamento.get("allow_fallbacks") is False
        and bool(roteamento.get("order") or roteamento.get("only"))
    )
    if not fixo:
        raise ConfiguracaoRecusada(
            f"{host} roteia o mesmo modelo para provedores diferentes. Fixe um em --chat-extra: "
            '{"provider":{"order":["<provedor>"],"allow_fallbacks":false}}'
        )


def sha_do_catalogo(catalogo: Sequence[McpToolInfo]) -> str:
    """O que o modelo lê do catálogo: nome, descrição, schema e anotações."""
    canonico = [
        {
            "name": t.name,
            "description": t.description,
            "inputSchema": t.input_schema,
            "annotations": t.annotations,
        }
        for t in sorted(catalogo, key=lambda t: t.name)
    ]
    return hashlib.sha256(
        json.dumps(canonico, ensure_ascii=False, sort_keys=True).encode()
    ).hexdigest()


def sha_do_prompt() -> str:
    return hashlib.sha256(Path(chat_pt_br.__file__).read_bytes()).hexdigest()


def conferir_catalogo(braco: Braco, servidas: set[str], tarefas: Sequence[Tarefa]) -> None:
    """O `/mcp` serviu o braço pedido? Derivado do gabarito, e não de uma lista à mão."""
    de_a = {n for t in tarefas for v in t.gabarito_a for n in v}
    de_b = {n for t in tarefas for v in t.gabarito_b for n in v}
    exigidas = de_a if braco == "A" else de_b
    estranhas = (de_b - de_a) if braco == "A" else (de_a - de_b)

    faltando = sorted(exigidas - servidas)
    if faltando:
        raise ConfiguracaoRecusada(
            f"O catálogo servido no braço {braco} não tem {', '.join(faltando)}."
        )
    intrusas = sorted(estranhas & servidas)
    if intrusas:
        raise ConfiguracaoRecusada(
            f"O catálogo servido no braço {braco} tem {', '.join(intrusas)}, que é do outro "
            "braço. Se é o braço B, a API provavelmente ainda não conhece o header "
            f"{HEADER_SUPERFICIE} e serviu o braço A."
        )


# --- uma tarefa -----------------------------------------------------------

Repor = Callable[[Sequence[str]], Awaitable[None]]


def repor_por_comando(comando: Sequence[str]) -> Repor:
    """Roda o `seed-eval.ts` antes de cada tarefa — tarefa de escrita muda o que a seguinte lê."""

    async def repor(estado: Sequence[str]) -> None:
        argumentos = [*comando, *(("--estado", ",".join(estado)) if estado else ())]
        processo = await asyncio.create_subprocess_exec(
            *argumentos,
            cwd=RAIZ_DO_REPO,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        saida, _ = await processo.communicate()
        if processo.returncode != 0:
            raise ConfiguracaoRecusada(
                f"A reposição da conta falhou ({shlex.join(argumentos)}):\n{saida.decode()[-800:]}"
            )

    return repor


async def executar(
    tarefa: Tarefa,
    braco: Braco,
    repeticao: int,
    *,
    provider: ToolChatCapability,
    tokens: TokensDeAvaliacao,
    mcp_url: str,
    repor: Repor,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[Execucao, list[McpToolInfo]]:
    await repor(tarefa.estado)
    bearer = await tokens.bearer(tarefa.persona)
    superficie = SUPERFICIE[braco]
    headers = {HEADER_SUPERFICIE: superficie} if superficie else {}

    async with McpClient(
        base_url=mcp_url, bearer=bearer, headers=headers, transport=transport
    ) as client:
        catalogo = await client.list_tools()
        permitidas = todas_permitidas(catalogo)
        perfil = json.loads((await client.call_tool("get_me", {})).text)
        fuso = str(perfil.get("timezone") or "America/Sao_Paulo")
        hoje = datetime.now(ZoneInfo(fuso)).date()

        chamadas: list[Chamada] = []
        motivos: list[str] = []
        tokens_entrada: int | None = 0
        tokens_saida: int | None = 0
        chamadas_ao_modelo = 0
        aprovacoes = 0
        erro: str | None = None
        texto_total: list[str] = []

        mensagem = tarefa.pedido
        historico: list[dict[str, str]] = []
        aprovadas: list[dict[str, str]] = []
        propostas_anteriores: list[int] = []
        inicio = time.monotonic()
        while True:
            texto: list[str] = []
            propostas: list[dict[str, str]] = []
            indices_das_propostas: list[int] = []
            posicao: dict[str, int] = {}
            motivo = "stop"
            async for evento in stream_chat_events(
                provider,
                client,
                permitidas,
                mensagem=mensagem,
                historico=historico,
                timezone=fuso,
                aprovadas=aprovadas,
            ):
                d = evento.data
                if evento.name == "token":
                    texto.append(d["text"])
                elif evento.name == "tool" and d["state"] == "input-available":
                    identificador = str(d["id"])
                    if identificador.startswith("aprovada-"):
                        # A proposta do turno anterior executando: o modelo não a pediu de
                        # novo, e contá-la outra vez inflaria o imposto. O resultado vai para
                        # a proposta, que é a chamada que ele fez.
                        posicao[identificador] = propostas_anteriores[
                            int(identificador.removeprefix("aprovada-"))
                        ]
                    else:
                        posicao[identificador] = len(chamadas)
                        chamadas.append(Chamada(d["name"], d["input"], "leitura"))
                elif evento.name == "tool" and d["state"] in {"output-available", "output-error"}:
                    i = posicao[str(d["id"])]
                    chamadas[i] = dataclasses.replace(
                        chamadas[i], ok=d["state"] == "output-available"
                    )
                elif evento.name == "proposal":
                    propostas.append({"name": d["name"], "arguments": d["arguments"]})
                    indices_das_propostas.append(len(chamadas))
                    chamadas.append(Chamada(d["name"], d["arguments"], "proposta"))
                elif evento.name == "usage":
                    chamadas_ao_modelo += 1
                    tokens_entrada = _somar(tokens_entrada, d.get("inputUnits"))
                    tokens_saida = _somar(tokens_saida, d.get("outputUnits"))
                elif evento.name == "error":
                    erro = f"{d['code']}: {d['message']}"
                elif evento.name == "done":
                    motivo = d["reason"]

            motivos.append(motivo)
            texto_total.append("".join(texto))
            if motivo != "awaiting_confirmation" or aprovacoes >= MAXIMO_DE_APROVACOES:
                break
            # O que a tela faz ao clicar "Confirmar" (`aprovar` em use-chat-stream.ts).
            historico = [
                *historico,
                {"role": "user", "content": mensagem},
                {"role": "assistant", "content": "".join(texto)},
            ]
            mensagem, aprovadas = "Confirmar", propostas
            propostas_anteriores = indices_das_propostas
            aprovacoes += 1

        segundos = time.monotonic() - inicio

    execucao = Execucao(
        tarefa=tarefa.id,
        braco=braco,
        repeticao=repeticao,
        hoje=hoje.isoformat(),
        chamadas=tuple(chamadas),
        aprovacoes=aprovacoes,
        chamadas_ao_modelo=chamadas_ao_modelo,
        tokens_entrada=tokens_entrada,
        tokens_saida=tokens_saida,
        segundos=round(segundos, 3),
        motivos=tuple(motivos),
        erro=erro,
        texto="\n---\n".join(texto_total),
    )
    return execucao, catalogo


def _somar(acumulado: int | None, valor: object) -> int | None:
    """Unidade ausente contamina a soma, como no `chat.service.ts`: total desconhecido."""
    if acumulado is None or not isinstance(valor, int):
        return None
    return acumulado + valor


# --- ledger ---------------------------------------------------------------

_CHAVE = (
    "braco",
    "modelo",
    "provedor_host",
    "chat_extra",
    "tarefas_sha256",
    "catalogo_sha256",
    "prompt_sha256",
    "repeticoes",
)


def execucao_anterior(ledger: Path, cab: CabecalhoDaRodada) -> dict[str, Any] | None:
    if not ledger.is_file():
        return None
    chave = {k: cab.como_json()[k] for k in _CHAVE}
    for linha in ledger.read_text(encoding="utf-8").splitlines():
        if linha.strip():
            registro: dict[str, Any] = json.loads(linha)
            if all(registro.get(k) == v for k, v in chave.items()):
                return registro
    return None


def registrar(ledger: Path, cab: CabecalhoDaRodada) -> None:
    registro = {**{k: cab.como_json()[k] for k in _CHAVE}, "data": cab.data}
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.open("a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(registro, ensure_ascii=False, sort_keys=True) + "\n")


# --- a rodada -------------------------------------------------------------


def restritas_do(catalogo: Sequence[McpToolInfo]) -> set[str]:
    oferecidas = {t.name for t in todas_permitidas(catalogo)}
    return {t.name for t in catalogo} - oferecidas


async def rodar(args: argparse.Namespace) -> int:
    tarefas_todas = carregar(args.tarefas_arquivo)
    tarefas = [t for t in tarefas_todas if t.split == args.split]
    truncado = False
    if args.tarefas:
        pedidas = set(args.tarefas.split(","))
        desconhecidas = pedidas - {t.id for t in tarefas}
        if desconhecidas:
            raise ConfiguracaoRecusada(
                f"Tarefas fora do split {args.split}: {sorted(desconhecidas)}"
            )
        tarefas, truncado = [t for t in tarefas if t.id in pedidas], True

    chat_extra: dict[str, Any] = json.loads(args.chat_extra) if args.chat_extra else {}
    exigir_provedor_fixo(args.base_url, chat_extra)

    api_key = os.environ.get(args.api_key_env, "") if args.api_key_env else ""
    tokens = TokensDeAvaliacao.do_ambiente()
    repor = repor_por_comando(shlex.split(args.comando_de_reposicao))
    saida: Path = args.saida
    saida.mkdir(parents=True, exist_ok=True)
    arquivo_execucoes = saida / "execucoes.jsonl"

    feitas: set[tuple[str, int]] = set()
    if arquivo_execucoes.exists():
        if not args.continuar:
            raise ConfiguracaoRecusada(
                f"{arquivo_execucoes} já existe. Use --continuar para retomar, ou outra --saida."
            )
        for linha in arquivo_execucoes.read_text(encoding="utf-8").splitlines():
            bruto = json.loads(linha)
            feitas.add((bruto["tarefa"], bruto["repeticao"]))

    async with ProvedorDoEval(
        base_url=args.base_url, api_key=api_key, text_model=args.modelo, chat_extra=chat_extra
    ) as provider:
        # Pré-voo: o catálogo servido decide a configuração, e ele precisa estar certo
        # antes de a primeira conversa custar alguma coisa.
        superficie = SUPERFICIE[args.braco]
        async with McpClient(
            base_url=args.mcp_url,
            bearer=await tokens.bearer("usuario"),
            headers={HEADER_SUPERFICIE: superficie} if superficie else {},
        ) as client:
            catalogo = await client.list_tools()
        conferir_catalogo(args.braco, {t.name for t in catalogo}, tarefas_todas)
        catalogo_sha = sha_do_catalogo(catalogo)

        cab = CabecalhoDaRodada(
            braco=args.braco,
            split=args.split,
            modelo=args.modelo,
            provedor_host=urlparse(args.base_url).hostname or args.base_url,
            chat_extra=chat_extra,
            tarefas_sha256=impressao_digital(args.tarefas_arquivo, args.split),
            catalogo_sha256=catalogo_sha,
            prompt_sha256=sha_do_prompt(),
            repeticoes=args.repeticoes,
            data=date.today().isoformat(),
            tarefas_rodadas=len(tarefas),
            truncado=truncado,
        )
        if args.split == "eval" and not truncado:
            anterior = execucao_anterior(args.ledger, cab)
            if anterior and not args.repetir_eval:
                raise ConfiguracaoRecusada(
                    f"Esta configuração já foi medida em {anterior['data']} ({args.ledger}). "
                    "Rodar de novo, quem sabe melhora, é o vazamento que o ledger existe para "
                    "mostrar. Mudou algo? A impressão digital muda sozinha."
                )
        (saida / "cabecalho.json").write_text(
            json.dumps(cab.como_json(), ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (saida / "restritas.json").write_text(json.dumps(sorted(restritas_do(catalogo))))

        total = len(tarefas) * args.repeticoes
        n = 0
        for tarefa in tarefas:
            for repeticao in range(1, args.repeticoes + 1):
                n += 1
                if (tarefa.id, repeticao) in feitas:
                    continue
                execucao, servido = await executar(
                    tarefa,
                    args.braco,
                    repeticao,
                    provider=provider,
                    tokens=tokens,
                    mcp_url=args.mcp_url,
                    repor=repor,
                )
                if sha_do_catalogo(servido) != catalogo_sha:
                    raise ConfiguracaoRecusada("O catálogo servido mudou no meio da rodada.")
                with arquivo_execucoes.open("a", encoding="utf-8") as arquivo:
                    arquivo.write(json.dumps(execucao.como_json(), ensure_ascii=False) + "\n")
                marca = "erro" if execucao.erro else f"{len(execucao.chamadas)} chamadas"
                print(f"[{n}/{total}] {tarefa.id} #{repeticao}: {marca}", flush=True)

    await tokens.aclose()
    return escrever_relatorio(saida, args.tarefas_arquivo, args.ledger, registrar_no_ledger=True)


def _ler_rodada(
    saida: Path, tarefas_arquivo: Path
) -> tuple[CabecalhoDaRodada, list[ResultadoDaTarefa], set[str]]:
    cab = CabecalhoDaRodada(**json.loads((saida / "cabecalho.json").read_text(encoding="utf-8")))
    restritas = set(json.loads((saida / "restritas.json").read_text(encoding="utf-8")))
    execucoes = [
        Execucao.de_json(json.loads(linha))
        for linha in (saida / "execucoes.jsonl").read_text(encoding="utf-8").splitlines()
        if linha.strip()
    ]
    return cab, agrupar(carregar(tarefas_arquivo), execucoes, restritas), restritas


def escrever_relatorio(
    saida: Path, tarefas_arquivo: Path, ledger: Path, *, registrar_no_ledger: bool
) -> int:
    cab, resultados, restritas = _ler_rodada(saida, tarefas_arquivo)
    (saida / "relatorio.md").write_text(
        markdown_do_braco(cab, resultados, restritas), encoding="utf-8"
    )
    motivo = motivo_de_rascunho(cab, resultados)
    if motivo is None and registrar_no_ledger:
        registrar(ledger, cab)
        print(f"Medição registrada em {ledger}.")
    else:
        # O ledger registra medição, e não tentativa: ver o eval de reconhecimento.
        print(f"Rascunho, nada registrado no ledger: {motivo}.")
    print(f"Relatório em {saida / 'relatorio.md'}.")
    return 0


def comparar_rodadas(args: argparse.Namespace) -> int:
    cab_a, a, _ = _ler_rodada(args.rodada_a, args.tarefas_arquivo)
    cab_b, b, _ = _ler_rodada(args.rodada_b, args.tarefas_arquivo)
    if (cab_a.braco, cab_b.braco) != ("A", "B"):
        raise ConfiguracaoRecusada("Passe a rodada do braço A primeiro e a do B depois.")
    texto = markdown_da_comparacao(cab_a, cab_b, a, b)
    if args.saida:
        args.saida.write_text(texto, encoding="utf-8")
    print(texto)
    return 0


# --- CLI ------------------------------------------------------------------


def _argumentos(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m fatia_agent.eval.run_fronteira",
        description="Eval da fronteira de tools: entidade x intenção.",
    )
    parser.add_argument("--tarefas-arquivo", type=Path, default=TAREFAS_PADRAO)
    sub = parser.add_subparsers(dest="comando", required=True)

    r = sub.add_parser("rodar", help="Roda um braço sobre um split.")
    r.add_argument("--braco", choices=("A", "B"), required=True)
    r.add_argument("--split", choices=("dev", "eval"), default="dev")
    r.add_argument("--base-url", required=True, help="Endpoint OpenAI-compatível.")
    r.add_argument("--modelo", required=True)
    r.add_argument(
        "--api-key-env",
        default="OPENROUTER_API_KEY",
        help="Variável de ambiente com a chave do provedor. Vazio para LM Studio.",
    )
    r.add_argument(
        "--chat-extra",
        default="",
        help='JSON somado ao corpo do chat: temperatura, {"provider": ...} do OpenRouter.',
    )
    r.add_argument("--repeticoes", type=int, default=5)
    r.add_argument("--tarefas", default="", help="Ids separados por vírgula. Vira rascunho.")
    r.add_argument("--mcp-url", default="http://localhost:3000/mcp")
    r.add_argument(
        "--comando-de-reposicao",
        default="pnpm --silent db:seed:eval --",
        help="Roda na raiz do repositório antes de cada tarefa.",
    )
    r.add_argument("--saida", type=Path, required=True)
    r.add_argument("--ledger", type=Path, default=DIRETORIO_PADRAO / "fronteira-runs.jsonl")
    r.add_argument("--continuar", action="store_true", help="Retoma uma --saida interrompida.")
    r.add_argument(
        "--repetir-eval",
        action="store_true",
        help="Mede de novo uma configuração já medida. Leia o §ledger do doc antes.",
    )

    c = sub.add_parser("comparar", help="Tabela pareada A x B de duas rodadas.")
    c.add_argument("rodada_a", type=Path)
    c.add_argument("rodada_b", type=Path)
    c.add_argument("--saida", type=Path, default=None)

    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _argumentos(argv)
    try:
        if args.comando == "rodar":
            return asyncio.run(rodar(args))
        return comparar_rodadas(args)
    except (ConfiguracaoRecusada, ContaDeAvaliacaoError, McpError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

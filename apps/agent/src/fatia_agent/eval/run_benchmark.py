"""O runner do benchmark de reconhecimento de refeição (#138).

    uv run python -m fatia_agent.eval.run_benchmark \\
      --base-url http://localhost:1234/v1 --model google/gemma-4-12b-qat \\
      --split dev --saida /tmp/execucao

**Ele reusa o caminho de produção inteiro.** A mesma `recognize_meal` da #139, o
mesmo prompt, o mesmo `OpenAICompatProvider` com as mesmas guardas de host e
modelo revisados (#136). Um runner com prompt próprio mediria um produto que não
existe — e é assim que um benchmark passa a descrever outra coisa sem ninguém
perceber.

Duas recusas moram aqui, e as duas existem para o **número** valer:

- **`sha256` de cada foto conferido antes de rodar** (`manifest.py`): o relatório
  se refere a estas fotos, não a um diretório que alguém mexeu depois.
- **`--split eval` roda uma vez por prompt e por modelo.** O prompt vai ser
  ajustado — é o trabalho. Se o ajuste for feito olhando as fotos que produzem o
  número, o número é otimista e ninguém consegue auditar isso depois. O ledger em
  `eval/eval-runs.jsonl` é versionado justamente para que a repetição apareça no
  diff em vez de na cabeça de quem rodou.

O ledger registra **medição**, e não tentativa: execução que o próprio relatório
se recusa a publicar não grava linha nenhuma (`motivo_de_nao_medir`), porque uma
linha afirmando um `eval` que não aconteceu trancaria a medição de verdade atrás
de `--repetir-eval`. E a chave é o `sha256` dos rótulos do **split medido**: uma
foto nova no `dev` não destrava o `eval`.
"""

import argparse
import asyncio
import dataclasses
import hashlib
import json
import time
from datetime import date
from pathlib import Path

from ..providers import AIProviderError, build_provider
from ..providers.base import VisionCapability
from ..recognition.recognize_meal import PROMPT, recognize_meal
from ..settings import AgentSettings, endpoint_host
from . import manifest as mf
from . import metrics as mt
from .report import Cabecalho, Limiares, montar_markdown, motivo_de_rascunho

# Raiz dos dados do benchmark: manifesto, imagens e ledger. `parents[3]` sai de
# `src/fatia_agent/eval/` até `apps/agent/`.
DIRETORIO_PADRAO = Path(__file__).resolve().parents[3] / "eval"


@dataclasses.dataclass(frozen=True)
class Execucao:
    """Uma passada completa sobre um split. Vira JSON e vira Markdown."""

    cabecalho: Cabecalho
    resultados: list[mt.ResultadoDaFoto]
    nao_casados: list[tuple[str, str]]


async def executar(
    provider: VisionCapability,
    fotos: list[mf.FotoDoConjunto],
    *,
    cabecalho: Cabecalho,
) -> Execucao:
    """Roda o conjunto, foto a foto, e casa cada resposta com o rótulo.

    **Sequencial de propósito.** Concorrência aqui melhoraria o relógio e
    estragaria a única métrica que depende dele: a latência que sai de um lote
    paralelo contra uma GPU só é a fila, não o tempo que a pessoa espera.
    """
    resultados: list[mt.ResultadoDaFoto] = []
    nao_casados: list[tuple[str, str]] = []

    for foto in fotos:
        inicio = time.perf_counter()
        try:
            reconhecida = await recognize_meal(
                provider, foto.caminho.read_bytes(), media_type=foto.media_type
            )
        except AIProviderError as erro:
            resultados.append(
                mt.ResultadoDaFoto(
                    foto_id=foto.rotulo.id,
                    latencia_s=time.perf_counter() - inicio,
                    falha=erro.code,
                )
            )
            continue

        resultado = mt.casar_foto(
            foto_id=foto.rotulo.id,
            latencia_s=time.perf_counter() - inicio,
            previstos=[(item.name, item.grams, item.kcal) for item in reconhecida.items],
            rotulados=[(item.food, item.grams, item.kcal_100g) for item in foto.rotulo.items],
        )
        resultados.append(resultado)

        # Uma sobra de cada lado na mesma foto é quase sempre o mesmo alimento
        # com dois nomes ("macaxeira" e "mandioca"). Com duas sobras de cada lado
        # não dá para dizer qual é qual, e adivinhar viraria sinônimo errado no
        # mapa — que é precisão inflada com aparência de manutenção.
        if len(resultado.extras) == 1 and len(resultado.faltantes) == 1:
            nao_casados.append((resultado.extras[0].nome, resultado.faltantes[0].nome))

    return Execucao(cabecalho=cabecalho, resultados=resultados, nao_casados=nao_casados)


def montar_saida(execucao: Execucao, limiares: Limiares | None = None) -> tuple[str, str]:
    """`(markdown, json)` da execução."""
    ident = mt.identificacao(execucao.resultados)
    porc = mt.porcao(execucao.resultados)
    oper = mt.operacional(execucao.resultados)

    markdown = montar_markdown(
        execucao.cabecalho,
        ident,
        porc,
        oper,
        limiares=limiares,
        nao_casados=execucao.nao_casados,
    )
    bruto = json.dumps(
        {
            "cabecalho": {
                **dataclasses.asdict(execucao.cabecalho),
                "data": execucao.cabecalho.data.isoformat(),
            },
            "identificacao": dataclasses.asdict(ident),
            "porcao": dataclasses.asdict(porc),
            "operacional": dataclasses.asdict(oper),
            "por_foto": [dataclasses.asdict(r) for r in execucao.resultados],
        },
        ensure_ascii=False,
        indent=2,
    )
    return markdown, bruto


def motivo_de_nao_medir(execucao: Execucao) -> str | None:
    """Por que esta execução **não é uma medição**; `None` quando ela é.

    É a mesma regra do relatório, e de propósito: o ledger só pode registrar o
    que o documento assumiria publicar. Uma execução em que o provedor recusou
    tudo produz um ledger versionado afirmando uma medição que não houve — e
    tranca a medição de verdade atrás de `--repetir-eval`.
    """
    return motivo_de_rascunho(
        execucao.cabecalho,
        mt.identificacao(execucao.resultados),
        mt.porcao(execucao.resultados),
    )


# --- ledger: o split de avaliação roda uma vez por prompt ------------------


def chave_da_execucao(cabecalho: Cabecalho) -> dict[str, str]:
    return {
        "modelo": cabecalho.modelo,
        "prompt_sha256": cabecalho.prompt_sha256,
        "conjunto_sha256": cabecalho.conjunto_sha256,
    }


def execucao_anterior(ledger: Path, cabecalho: Cabecalho) -> dict[str, str] | None:
    """A execução já registrada com o mesmo prompt, modelo e conjunto, se houver."""
    if not ledger.is_file():
        return None
    chave = chave_da_execucao(cabecalho)
    for linha in ledger.read_text(encoding="utf-8").splitlines():
        if not linha.strip():
            continue
        registro: dict[str, str] = json.loads(linha)
        if all(registro.get(campo) == valor for campo, valor in chave.items()):
            return registro
    return None


def registrar_execucao(ledger: Path, cabecalho: Cabecalho) -> None:
    registro = {**chave_da_execucao(cabecalho), "data": cabecalho.data.isoformat()}
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.open("a", encoding="utf-8") as arquivo:
        arquivo.write(json.dumps(registro, ensure_ascii=False) + "\n")


# --- CLI -------------------------------------------------------------------


def _limite(valor: str) -> int:
    """`--limite` só existe acima de zero.

    `--limite 0` caía num `bool(0)` e era engolido: o runner rodava o conjunto
    inteiro sem marcar o relatório como truncado. Uma flag que o programa ignora
    em silêncio é pior que uma flag que não existe.
    """
    numero = int(valor)
    if numero < 1:
        raise argparse.ArgumentTypeError(f"--limite precisa ser ≥ 1 (recebi {numero}).")
    return numero


def _argumentos(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m fatia_agent.eval.run_benchmark",
        description="Mede o reconhecimento de refeição contra um conjunto rotulado (#138).",
    )
    parser.add_argument("--base-url", required=True, help="Endpoint OpenAI-compatível.")
    parser.add_argument("--model", required=True, help="Modelo de visão a medir.")
    parser.add_argument("--split", choices=("dev", "eval"), default="dev")
    parser.add_argument("--manifesto", type=Path, default=DIRETORIO_PADRAO / "manifest.jsonl")
    parser.add_argument("--imagens", type=Path, default=DIRETORIO_PADRAO / "images")
    parser.add_argument("--ledger", type=Path, default=DIRETORIO_PADRAO / "eval-runs.jsonl")
    parser.add_argument(
        "--saida",
        type=Path,
        default=None,
        help="Prefixo dos arquivos de saída (.md e .json). Sem ele, imprime na tela.",
    )
    parser.add_argument(
        "--limite",
        type=_limite,
        default=None,
        help="Corta o conjunto — só para depurar o runner. Marca o relatório como rascunho.",
    )
    parser.add_argument(
        "--repetir-eval",
        action="store_true",
        help="Roda o split `eval` de novo com o mesmo prompt e modelo. Leia o §ledger.",
    )
    return parser.parse_args(argv)


async def _rodar(args: argparse.Namespace) -> int:
    rotulos = [r for r in mf.carregar_manifesto(args.manifesto) if r.split == args.split]
    if not rotulos:
        print(f"Nenhuma foto no split '{args.split}' de {args.manifesto}.")
        return 1

    fotos = mf.resolver_fotos(rotulos, args.imagens)
    truncado = args.limite is not None and args.limite < len(fotos)
    if args.limite is not None:
        fotos = fotos[: args.limite]

    cabecalho = Cabecalho(
        modelo=args.model,
        provedor_host=endpoint_host(args.base_url),
        split=args.split,
        conjunto_sha256=mf.sha256_do_conjunto(rotulos),
        prompt_sha256=hashlib.sha256(PROMPT.encode("utf-8")).hexdigest(),
        n_fotos=len(fotos),
        data=date.today(),
        truncado=truncado,
    )

    if args.split == "eval" and not args.repetir_eval:
        anterior = execucao_anterior(args.ledger, cabecalho)
        if anterior is not None:
            print(
                f"O split 'eval' já foi medido em {anterior.get('data')} com este prompt, "
                f"este modelo e este conjunto ({args.ledger}).\n"
                "Rodar de novo depois de olhar o resultado é como o número vira otimista "
                "sem ninguém perceber. Ajuste o prompt (a impressão digital muda) ou passe "
                "--repetir-eval assumindo isso."
            )
            return 2

    # `build_provider` e não um cliente montado à mão: as guardas de host e de
    # modelo revisados (#136) valem para o benchmark exatamente como valem para o
    # produto. Medir contra um gateway não revisado mandaria fotos de comida de
    # gente real para um terceiro que a /privacy não nomeia.
    settings = AgentSettings(ai_base_url=args.base_url, ai_model_vision=args.model)
    provider = build_provider(settings)
    try:
        execucao = await executar(provider, fotos, cabecalho=cabecalho)
    finally:
        await provider.aclose()

    # O ledger registra **medição**, não tentativa. Gravar uma execução que o
    # próprio relatório se recusa a publicar deixa no repositório uma linha
    # afirmando um `eval` que não aconteceu — e tranca o `eval` de verdade atrás
    # de `--repetir-eval`.
    motivo = motivo_de_nao_medir(execucao)
    if args.split == "eval":
        if motivo is None:
            registrar_execucao(args.ledger, cabecalho)
        else:
            print(f"Ledger não gravado — esta execução não é uma medição: {motivo}")

    markdown, bruto = montar_saida(execucao)
    if args.saida is None:
        print(markdown)
    else:
        args.saida.parent.mkdir(parents=True, exist_ok=True)
        args.saida.with_suffix(".md").write_text(markdown, encoding="utf-8")
        args.saida.with_suffix(".json").write_text(bruto, encoding="utf-8")
        print(f"Relatório em {args.saida.with_suffix('.md')}")

    if all(not resultado.respondeu for resultado in execucao.resultados):
        # Nenhuma foto respondeu: é provedor mal configurado ou fora do ar, e não
        # um resultado. Sair 0 faria um script de CI ou um `&&` tratar como
        # sucesso a execução que mais precisa ser vista.
        print("Nenhuma foto rendeu resposta utilizável — confira o provedor, não o modelo.")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _argumentos(argv)
    try:
        return asyncio.run(_rodar(args))
    except mf.ErroDeManifesto as erro:
        print(str(erro))
        return 1
    except AIProviderError as erro:
        # Provedor mal configurado é falha da execução inteira, não de uma foto:
        # o relatório sairia com 100 % de falha e aparência de resultado.
        print(f"{erro.code}: {erro.message}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

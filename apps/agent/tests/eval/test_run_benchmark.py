"""O runner ponta a ponta (#138), com provedor duplo e manifesto de brinquedo.

Nenhum modelo e nenhuma rede: o que se prova aqui é que o pipeline **soma
certo** — foto lida, resposta casada com o rótulo, agregação. E que ele recusa
rodar quando o conjunto não bate com o manifesto, que é o que faz o número se
referir a estas fotos e não a outras.
"""

import asyncio
import hashlib
import json
from datetime import date
from pathlib import Path

import pytest

from fatia_agent.eval.manifest import (
    ErroDeManifesto,
    RotuloDeFoto,
    carregar_manifesto,
    resolver_fotos,
    sha256_do_conjunto,
)
from fatia_agent.eval.metrics import identificacao, porcao
from fatia_agent.eval.report import MINIMO_PUBLICAVEL, Cabecalho
from fatia_agent.eval.run_benchmark import (
    execucao_anterior,
    executar,
    main,
    montar_saida,
    registrar_execucao,
)
from fatia_agent.providers.errors import AIProviderTimeout
from fatia_agent.recognition.recognize_meal import PROMPT


class ProvedorGravado:
    """Duplo de `VisionCapability`: devolve o texto gravado para cada chamada."""

    def __init__(self, respostas: list[str | Exception]) -> None:
        self._respostas = list(respostas)
        self.prompts: list[str] = []
        self.media_types: list[str] = []

    async def describe(self, image: bytes, *, prompt: str, media_type: str = "image/jpeg") -> str:
        assert image, "o runner precisa ler os bytes da foto"
        self.prompts.append(prompt)
        self.media_types.append(media_type)
        resposta = self._respostas.pop(0)
        if isinstance(resposta, Exception):
            raise resposta
        return resposta

    async def aclose(self) -> None:
        return None


def escrever_conjunto(tmp_path: Path, rotulos: list[dict[str, object]]) -> tuple[Path, Path]:
    """Escreve `manifest.jsonl` + imagens de brinquedo e devolve os caminhos."""
    imagens = tmp_path / "images"
    imagens.mkdir()
    linhas: list[str] = []
    for rotulo in rotulos:
        conteudo = f"bytes-de-{rotulo['id']}".encode()
        (imagens / f"{rotulo['id']}.jpg").write_bytes(conteudo)
        linha = {**rotulo, "sha256": hashlib.sha256(conteudo).hexdigest()}
        linhas.append(json.dumps(linha, ensure_ascii=False))
    manifesto = tmp_path / "manifest.jsonl"
    manifesto.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return manifesto, imagens


CONJUNTO = [
    {
        "id": "prato-feito-01",
        "split": "dev",
        "items": [
            {"food": "arroz branco cozido", "grams": 150, "kcal_100g": 128},
            {"food": "feijão carioca cozido", "grams": 100, "kcal_100g": 76},
        ],
    },
    {
        "id": "pao-de-queijo-01",
        "split": "dev",
        "items": [{"food": "pão de queijo", "grams": 60, "kcal_100g": 363}],
    },
    {
        "id": "prato-lavado-01",
        "split": "dev",
        "items": [],
    },
]


_ARROZ = {"food": "arroz branco cozido", "grams": 150, "kcal_100g": 128}
_RESPOSTA_CERTA = '{"items":[{"name":"arroz branco cozido","grams":150,"confidence":0.9}]}'


def _rotulos(tmp_path: Path, nome: str, linhas: list[dict[str, object]]) -> list[RotuloDeFoto]:
    """Manifesto sem imagem: só o que `sha256_do_conjunto` precisa ver."""
    caminho = tmp_path / nome
    caminho.write_text(
        "\n".join(json.dumps({"sha256": "0" * 64, **linha}) for linha in linhas) + "\n",
        encoding="utf-8",
    )
    return carregar_manifesto(caminho)


def _so_do_eval(rotulos: list[RotuloDeFoto]) -> list[RotuloDeFoto]:
    return [rotulo for rotulo in rotulos if rotulo.split == "eval"]


def conjunto_publicavel(tmp_path: Path) -> tuple[Path, Path]:
    """`MINIMO_PUBLICAVEL` fotos no `eval`, todas com `kcal_100g`."""
    return escrever_conjunto(
        tmp_path,
        [
            {"id": f"prato-{i:02d}", "split": "eval", "items": [_ARROZ]}
            for i in range(MINIMO_PUBLICAVEL)
        ],
    )


def argv_de(manifesto: Path, imagens: Path, ledger: Path, saida: Path) -> list[str]:
    return [
        "--base-url",
        "http://localhost:1234/v1",
        "--model",
        "modelo-de-teste",
        "--split",
        "eval",
        "--manifesto",
        str(manifesto),
        "--imagens",
        str(imagens),
        "--ledger",
        str(ledger),
        "--saida",
        str(saida),
    ]


def cabecalho_de_teste(n_fotos: int, split: str = "dev") -> Cabecalho:
    return Cabecalho(
        modelo="modelo-de-teste",
        provedor_host="localhost",
        split=split,
        conjunto_sha256="a" * 64,
        prompt_sha256=hashlib.sha256(PROMPT.encode()).hexdigest(),
        n_fotos=n_fotos,
        data=date(2026, 8, 4),
    )


class TestExecutar:
    def test_soma_o_conjunto_inteiro(self, tmp_path):
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO)
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(
            [
                # Acerta os dois, com 20 % a mais de arroz.
                '{"items":[{"name":"arroz branco cozido","grams":180,"confidence":0.9},'
                '{"name":"feijão carioca cozido","grams":100,"confidence":0.8}]}',
                # Acerta o pão e inventa um requeijão.
                '{"items":[{"name":"pão de queijo","grams":60,"confidence":0.9},'
                '{"name":"requeijão","grams":20,"confidence":0.3,"kcal":50}]}',
                # Prato lavado: não inventa comida.
                '{"items":[],"note":"não identifiquei alimentos na foto"}',
            ]
        )

        execucao = asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(3)))

        ident = identificacao(execucao.resultados)
        assert ident.n_fotos == 3
        assert ident.verdadeiros_positivos == 3
        assert ident.falsos_positivos == 1
        assert ident.falsos_negativos == 0
        assert ident.precisao == 0.75

        porc = porcao(execucao.resultados)
        # Um item com 20 % de erro e dois com 0 %.
        assert porc.mape_gramas.n == 3
        assert porc.mape_gramas.media == pytest.approx(20 / 3)

    def test_usa_o_prompt_de_producao(self, tmp_path):
        """O benchmark tem de medir o produto. Um prompt próprio aqui mediria
        uma coisa que ninguém usa, e a diferença não apareceria em lugar nenhum
        — é a mesma razão de o `sha256` do prompt ir no relatório."""
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[:1])
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(['{"items":[]}'])

        asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(1)))

        assert provedor.prompts == [PROMPT]
        assert provedor.media_types == ["image/jpeg"]

    def test_falha_do_provedor_nao_vira_erro_de_identificacao(self, tmp_path):
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[:2])
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(
            [
                AIProviderTimeout("o provedor não respondeu"),
                '{"items":[{"name":"pão de queijo","grams":60,"confidence":0.9}]}',
            ]
        )

        execucao = asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(2)))

        assert execucao.resultados[0].falha == "AI_PROVIDER_TIMEOUT"
        assert identificacao(execucao.resultados).n_fotos == 1

    def test_prosa_do_modelo_conta_como_resposta_inutilizavel(self, tmp_path):
        """`parse_recognized_meal` é o mesmo da #139: modelo educado que responde
        em prosa vira `AI_RESPONSE_UNPARSEABLE`, e isso é métrica operacional,
        não erro de reconhecimento."""
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[:1])
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(["Claro! Este prato parece delicioso."])

        execucao = asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(1)))

        assert execucao.resultados[0].falha == "AI_RESPONSE_UNPARSEABLE"

    def test_sobra_de_um_lado_e_de_outro_vira_candidato_a_sinonimo(self, tmp_path):
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[1:2])
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(['{"items":[{"name":"chipa","grams":60,"confidence":0.7}]}'])

        execucao = asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(1)))

        assert execucao.nao_casados == [("chipa", "pão de queijo")]

    def test_saida_tem_markdown_e_json(self, tmp_path):
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[:1])
        fotos = resolver_fotos(carregar_manifesto(manifesto), imagens)
        provedor = ProvedorGravado(['{"items":[]}'])

        execucao = asyncio.run(executar(provedor, fotos, cabecalho=cabecalho_de_teste(1)))
        markdown, bruto = montar_saida(execucao)

        assert "NÃO É RESULTADO PUBLICÁVEL" in markdown
        dados = json.loads(bruto)
        assert dados["cabecalho"]["n_fotos"] == 1
        assert dados["por_foto"][0]["foto_id"] == "prato-feito-01"


class TestIntegridadeDoConjunto:
    def test_foto_alterada_depois_do_rotulo_aborta(self, tmp_path):
        """O `sha256` é o que amarra o número publicado **a estas fotos**. Sem a
        recusa, um relatório e um diretório que alguém mexeu depois ficam
        indistinguíveis de um resultado válido."""
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO[:1])
        (imagens / "prato-feito-01.jpg").write_bytes(b"outra foto")

        with pytest.raises(ErroDeManifesto, match="sha256 não confere"):
            resolver_fotos(carregar_manifesto(manifesto), imagens)

    def test_foto_ausente_aborta_listando_todas(self, tmp_path):
        manifesto, imagens = escrever_conjunto(tmp_path, CONJUNTO)
        (imagens / "prato-feito-01.jpg").unlink()
        (imagens / "pao-de-queijo-01.jpg").unlink()

        with pytest.raises(ErroDeManifesto) as erro:
            resolver_fotos(carregar_manifesto(manifesto), imagens)

        assert "prato-feito-01" in str(erro.value)
        assert "pao-de-queijo-01" in str(erro.value)

    def test_alimento_repetido_no_mesmo_rotulo_e_recusado(self, tmp_path):
        """Dois "arroz branco" na mesma foto tornam o casamento um-para-um
        ambíguo e o erro de porção indefinido."""
        manifesto = tmp_path / "manifest.jsonl"
        manifesto.write_text(
            json.dumps(
                {
                    "id": "duplicado",
                    "sha256": "0" * 64,
                    "split": "dev",
                    "items": [
                        {"food": "arroz branco", "grams": 100},
                        {"food": "Arroz Branco", "grams": 50},
                    ],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        with pytest.raises(ErroDeManifesto, match="alimento repetido"):
            carregar_manifesto(manifesto)

    def test_campo_desconhecido_no_rotulo_e_recusado(self, tmp_path):
        """`extra: forbid` porque um `gramas` escrito no lugar de `grams` viraria
        um rótulo sem peso — e o benchmark mediria contra o default."""
        manifesto = tmp_path / "manifest.jsonl"
        manifesto.write_text(
            json.dumps(
                {
                    "id": "typo",
                    "sha256": "0" * 64,
                    "split": "dev",
                    "items": [{"food": "arroz", "grams": 100, "gramas": 100}],
                }
            )
            + "\n",
            encoding="utf-8",
        )
        with pytest.raises(ErroDeManifesto):
            carregar_manifesto(manifesto)


class TestLedgerDoSplitDeAvaliacao:
    def test_mesmo_prompt_e_mesmo_modelo_ja_medidos_sao_reconhecidos(self, tmp_path):
        """O prompt vai ser ajustado — é o trabalho. Se o ajuste for feito
        olhando as fotos que produzem o número, o número fica otimista e ninguém
        consegue auditar isso depois. O ledger é versionado para a repetição
        aparecer no diff."""
        ledger = tmp_path / "eval-runs.jsonl"
        cabecalho = cabecalho_de_teste(30, split="eval")

        assert execucao_anterior(ledger, cabecalho) is None
        registrar_execucao(ledger, cabecalho)
        assert execucao_anterior(ledger, cabecalho) is not None

    def test_prompt_diferente_libera_nova_medicao(self, tmp_path):
        ledger = tmp_path / "eval-runs.jsonl"
        registrar_execucao(ledger, cabecalho_de_teste(30, split="eval"))

        outro = Cabecalho(
            modelo="modelo-de-teste",
            provedor_host="localhost",
            split="eval",
            conjunto_sha256="a" * 64,
            prompt_sha256="c" * 64,
            n_fotos=30,
            data=date(2026, 8, 5),
        )
        assert execucao_anterior(ledger, outro) is None

    def test_foto_nova_no_split_de_ajuste_nao_libera_repetir_o_eval(self, tmp_path):
        """A chave do ledger é o conjunto **medido**. Com o `sha256` do arquivo
        inteiro, acrescentar uma linha `dev` — que a medição do `eval` nem lê —
        passaria por conjunto novo e liberaria uma segunda medição do mesmo
        `eval`, que é justamente o que o ledger existe para impedir."""
        do_eval = {"id": "prato-01", "split": "eval", "items": [{"food": "arroz", "grams": 100}]}
        antes = _so_do_eval(_rotulos(tmp_path, "antes.jsonl", [do_eval]))
        depois = _so_do_eval(
            _rotulos(tmp_path, "depois.jsonl", [do_eval, {"id": "ajuste-09", "split": "dev"}])
        )
        assert sha256_do_conjunto(antes) == sha256_do_conjunto(depois)

    def test_linha_dev_acrescentada_depois_nao_destrava_o_eval_no_runner(
        self, tmp_path, monkeypatch
    ):
        """O mesmo, pelo caminho que o dono percorre: mede o `eval`, acrescenta
        uma foto ao `dev` e tenta medir de novo. Tem de continuar recusando."""
        manifesto, imagens = conjunto_publicavel(tmp_path)
        ledger = tmp_path / "eval-runs.jsonl"
        argv = argv_de(manifesto, imagens, ledger, tmp_path / "saida")
        monkeypatch.setattr(
            "fatia_agent.eval.run_benchmark.build_provider",
            lambda _settings: ProvedorGravado([_RESPOSTA_CERTA] * MINIMO_PUBLICAVEL),
        )
        assert main(argv) == 0

        with manifesto.open("a", encoding="utf-8") as arquivo:
            arquivo.write(
                json.dumps({"id": "ajuste-09", "sha256": "0" * 64, "split": "dev", "items": []})
                + "\n"
            )
        assert main(argv) == 2

    def test_ordem_das_linhas_nao_muda_o_conjunto(self, tmp_path):
        linhas = [{"id": "b-01", "split": "eval"}, {"id": "a-01", "split": "eval"}]
        rotulos = _rotulos(tmp_path, "ordem.jsonl", linhas)
        assert sha256_do_conjunto(rotulos) == sha256_do_conjunto(list(reversed(rotulos)))

    def test_rotulo_corrigido_muda_o_conjunto_e_libera_a_medicao(self, tmp_path):
        antes = _rotulos(tmp_path, "a.jsonl", [{"id": "p-01", "split": "eval", "items": [_ARROZ]}])
        depois = _rotulos(
            tmp_path,
            "b.jsonl",
            [{"id": "p-01", "split": "eval", "items": [_ARROZ, {"food": "farofa", "grams": 30}]}],
        )
        assert sha256_do_conjunto(antes) != sha256_do_conjunto(depois)


class TestOQueOLedgerRegistra:
    """O ledger registra **medição**, e não tentativa.

    Uma execução em que o provedor recusou tudo grava no repositório uma linha
    afirmando um `eval` que não aconteceu — e tranca a medição de verdade atrás
    de `--repetir-eval`, que é a porta que existe para o caso legítimo.
    """

    def test_execucao_toda_falha_nao_grava_o_ledger_e_sai_diferente_de_zero(
        self, tmp_path, monkeypatch
    ):
        manifesto, imagens = conjunto_publicavel(tmp_path)
        ledger = tmp_path / "eval-runs.jsonl"
        recusa = ProvedorGravado(
            [AIProviderTimeout("o provedor não respondeu")] * MINIMO_PUBLICAVEL
        )
        monkeypatch.setattr(
            "fatia_agent.eval.run_benchmark.build_provider", lambda _settings: recusa
        )

        codigo = main(argv_de(manifesto, imagens, ledger, tmp_path / "saida"))

        assert codigo != 0
        assert not ledger.exists()
        markdown = (tmp_path / "saida.md").read_text(encoding="utf-8")
        assert "NÃO É RESULTADO PUBLICÁVEL" in markdown

    def test_a_medicao_de_verdade_depois_de_uma_execucao_falha_nao_precisa_de_repetir(
        self, tmp_path, monkeypatch
    ):
        """É o dano concreto: com o ledger gravado pela execução falha, a medição
        seguinte — já configurada certo — sai com "já foi medido"."""
        manifesto, imagens = conjunto_publicavel(tmp_path)
        ledger = tmp_path / "eval-runs.jsonl"
        argv = argv_de(manifesto, imagens, ledger, tmp_path / "saida")

        monkeypatch.setattr(
            "fatia_agent.eval.run_benchmark.build_provider",
            lambda _settings: ProvedorGravado(
                [AIProviderTimeout("o provedor não respondeu")] * MINIMO_PUBLICAVEL
            ),
        )
        main(argv)

        monkeypatch.setattr(
            "fatia_agent.eval.run_benchmark.build_provider",
            lambda _settings: ProvedorGravado([_RESPOSTA_CERTA] * MINIMO_PUBLICAVEL),
        )
        assert main(argv) == 0
        assert ledger.is_file()
        assert "NÃO É RESULTADO PUBLICÁVEL" not in (tmp_path / "saida.md").read_text(
            encoding="utf-8"
        )

    def test_medicao_publicavel_e_registrada_e_a_repeticao_e_recusada(self, tmp_path, monkeypatch):
        manifesto, imagens = conjunto_publicavel(tmp_path)
        ledger = tmp_path / "eval-runs.jsonl"
        argv = argv_de(manifesto, imagens, ledger, tmp_path / "saida")
        monkeypatch.setattr(
            "fatia_agent.eval.run_benchmark.build_provider",
            lambda _settings: ProvedorGravado([_RESPOSTA_CERTA] * MINIMO_PUBLICAVEL),
        )

        assert main(argv) == 0
        assert main(argv) == 2


class TestLimite:
    def test_limite_zero_e_recusado_em_vez_de_ignorado(self, capsys):
        """`bool(0)` engolia a flag: o runner rodava o conjunto inteiro e o
        relatório saía sem o carimbo de truncado. Flag ignorada em silêncio é
        pior que flag inexistente."""
        with pytest.raises(SystemExit):
            main(["--base-url", "http://localhost:1234/v1", "--model", "m", "--limite", "0"])
        assert "--limite precisa ser ≥ 1" in capsys.readouterr().err

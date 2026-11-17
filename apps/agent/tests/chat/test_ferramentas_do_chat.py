"""As ferramentas locais do chat da #384: a busca na web, o "só no app" e a pausa por consultas.

Mesma regra de `test_graph.py`: o grafo de produção, o provedor e o `/mcp` de verdade com o
transporte trocado. A busca é a única coisa injetada (`buscar`), porque é ela que custa dinheiro
e sai para um terceiro — e é ela que este arquivo precisa ver recebendo **só** a pergunta.
"""

from fatia_agent.chat import web
from fatia_agent.chat.artefatos import artefato
from fatia_agent.providers.base import Usage, WebSearchResult, WebSource
from fatia_agent.providers.errors import AIProviderUnreachable

from .support import fim, fragmento_de_texto, fragmento_de_tool
from .turno import Resultado, turno


def _com_tool(nome: str, *, id: str = "c1", arguments: str = "{}") -> list[dict[str, object]]:
    return [fragmento_de_tool(0, id=id, name=nome, arguments=arguments), fim("tool_calls")]


class Buscador:
    """A busca de mentira: grava a pergunta e devolve as fontes do roteiro."""

    def __init__(self, resultado: WebSearchResult | Exception) -> None:
        self.perguntas: list[str] = []
        self._resultado = resultado

    async def __call__(self, query: str) -> WebSearchResult:
        self.perguntas.append(query)
        if isinstance(self._resultado, Exception):
            raise self._resultado
        return self._resultado


FONTE = WebSource(
    url="https://www.gov.br/saude/acai",
    title="Açaí: valor nutricional",
    domain="gov.br",
    content="100 g de polpa têm cerca de 58 kcal.",
)
ACHOU = WebSearchResult(
    sources=(FONTE,), usage=Usage(model="z-ai/glm-5.3-flash", input_units=900, cost_usd=0.0071)
)

PERGUNTA_COM_DADO = (
    '{"query":"calorias do açaí — sou a Ana, ana.silva@exemplo.com, (11) 98765-4321, '
    'CPF 123.456.789-09"}'
)


def _nomes_oferecidos(r: Resultado) -> set[str]:
    return {tool["function"]["name"] for tool in r.provider.corpos[0]["tools"]}


# --------------------------------------------------------------------- formatos novos


def test_os_formatos_novos_passam_e_cada_um_exige_o_proprio_campo():
    casos = {
        "bars": "bars",
        "list": "items",
        "range": "rows",
        "progress": "items",
        "scoreboard": "entries",
        "badges": "badges",
        "instructions": "steps",
        "file": "url",
        "sources": "sources",
        "app_only": "tool",
    }
    for tipo, campo in casos.items():
        assert artefato({"kind": tipo, campo: []})["kind"] == tipo, tipo
        assert artefato({"kind": tipo, "outra": 1}) is None, tipo
    # Sem formato padrão: o que a tela não conhece não vira Tabela.
    assert artefato({"kind": "pizza", "columns": [], "rows": []}) is None


# --------------------------------------------------------------------- busca na web


def test_a_pergunta_sai_sem_email_telefone_nem_documento():
    limpa = web.clean_query(
        "calorias do açaí ana.silva@exemplo.com (11) 98765-4321 CPF 123.456.789-09"
    )
    assert "@" not in limpa
    assert "98765" not in limpa
    assert "123.456" not in limpa
    assert limpa.startswith("calorias do açaí")


async def test_busca_desligada_nem_e_oferecida(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("ok")]], search_web=Buscador(ACHOU))
    assert web.NAME not in _nomes_oferecidos(r)


async def test_com_aceite_busca_so_a_pergunta_e_mostra_as_fontes(settings_factory):
    buscador = Buscador(ACHOU)
    r = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments=PERGUNTA_COM_DADO), [fragmento_de_texto("58 kcal.")]],
        web_search="on",
        search_web=buscador,
    )

    assert web.NAME in _nomes_oferecidos(r)
    (pergunta,) = buscador.perguntas
    assert "ana.silva" not in pergunta and "98765" not in pergunta and "123.456" not in pergunta
    assert "açaí" in pergunta
    (fontes,) = r.data_of("artifact")
    assert fontes == {
        "toolCallId": "c1",
        "kind": "sources",
        "query": pergunta,
        "sources": [{"title": FONTE.title, "url": FONTE.url, "domain": "gov.br"}],
    }
    # O custo da busca entra no livro-caixa do turno.
    assert any(
        u.get("costUsd") == 0.0071 and u.get("webSearches") == 1 for u in r.data_of("usage")
    )
    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "success"
    assert "58 kcal" in resultado["content"] and FONTE.url in resultado["content"]
    assert r.text() == "58 kcal."


async def test_sem_aceite_pede_antes_da_primeira_busca(settings_factory):
    buscador = Buscador(ACHOU)
    r = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"calorias do açaí"}')],
        web_search="ask",
        search_web=buscador,
    )

    assert buscador.perguntas == []
    assert r.data_of("done") == [{"status": "interrupted"}]
    pausa = r.interrupcao()["value"]
    assert pausa["kind"] == "web_consent"
    (acao,) = pausa["actions"]
    assert acao == {
        "kind": "web_consent",
        "toolCallId": "c1",
        "tool": web.NAME,
        "prompt": "Posso buscar na web?",
        "query": "calorias do açaí",
    }


async def test_aceitou_e_a_api_ligou_a_busca_entao_busca(settings_factory):
    buscador = Buscador(ACHOU)
    pausado = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"calorias do açaí"}')],
        web_search="ask",
        search_web=buscador,
    )
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("58 kcal.")]],
        mensagem=None,
        retomada={"approvals": {"c1": True}},
        grafo=pausado.grafo,
        web_search="on",
        search_web=buscador,
    )

    assert buscador.perguntas == ["calorias do açaí"]
    assert retomado.text() == "58 kcal."


async def test_aprovar_sem_o_aceite_gravado_nao_busca(settings_factory):
    """O sim da tela só vale com o aceite na API: quem decide o modo é ela, a cada turno."""
    buscador = Buscador(ACHOU)
    pausado = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"açaí"}')],
        web_search="ask",
        search_web=buscador,
    )
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Sem busca.")]],
        mensagem=None,
        retomada={"approvals": {"c1": True}},
        grafo=pausado.grafo,
        web_search="ask",
        search_web=buscador,
    )

    assert buscador.perguntas == []
    (resultado,) = [m for m in retomado.mensagens_de_tool() if m["tool_call_id"] == "c1"]
    assert resultado["content"] == web.DECLINED


async def test_recusou_e_responde_sem_buscar(settings_factory):
    buscador = Buscador(ACHOU)
    pausado = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"açaí"}')],
        web_search="ask",
        search_web=buscador,
    )
    retomado = await turno(
        settings_factory,
        [[fragmento_de_texto("Tudo bem.")]],
        mensagem=None,
        retomada={"approvals": {"c1": False}},
        grafo=pausado.grafo,
        web_search="on",
        search_web=buscador,
    )

    assert buscador.perguntas == []
    (resultado,) = [m for m in retomado.mensagens_de_tool() if m["tool_call_id"] == "c1"]
    assert resultado["content"] == web.DECLINED


async def test_nada_confiavel_e_busca_fora_do_ar_viram_texto_para_o_modelo(settings_factory):
    vazio = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"x"}'), [fragmento_de_texto("Não achei.")]],
        web_search="on",
        search_web=Buscador(WebSearchResult()),
    )
    (resultado,) = vazio.mensagens_de_tool()
    assert resultado["content"] == web.NO_RESULTS
    assert vazio.data_of("artifact") == []

    caiu = await turno(
        settings_factory,
        [_com_tool(web.NAME, arguments='{"query":"x"}'), [fragmento_de_texto("Sem busca.")]],
        web_search="on",
        search_web=Buscador(AIProviderUnreachable("fora do ar")),
    )
    (resultado,) = caiu.mensagens_de_tool()
    assert (resultado["status"], resultado["content"]) == ("error", web.UNAVAILABLE)
    assert caiu.text() == "Sem busca."


# --------------------------------------------------------------------- só no app


async def test_so_no_app_mostra_o_botao_e_nao_executa_nada(settings_factory):
    r = await turno(
        settings_factory,
        [
            _com_tool(
                "open_in_app", arguments='{"tool":"delete_meal","params":{"id":"m-1","x":{}}}'
            ),
            [fragmento_de_texto("Apague por lá.")],
        ],
    )

    oferecida = next(
        t["function"]
        for t in r.provider.corpos[0]["tools"]
        if t["function"]["name"] == "open_in_app"
    )
    assert oferecida["parameters"]["properties"]["tool"]["enum"] == ["delete_meal"]
    assert r.chamadas_ao_mcp("delete_meal") == 0
    (cartao,) = r.data_of("artifact")
    assert cartao == {
        "toolCallId": "c1",
        "kind": "app_only",
        "tool": "delete_meal",
        "title": "Delete Meal",
        "params": {"id": "m-1"},
    }
    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "success"
    assert "NÃO foi feita" in resultado["content"]


async def test_so_no_app_recusa_o_que_nao_e_restrito(settings_factory):
    r = await turno(
        settings_factory,
        [
            _com_tool("open_in_app", arguments='{"tool":"log_meal"}'),
            [fragmento_de_texto("ok")],
        ],
    )
    (resultado,) = r.mensagens_de_tool()
    assert resultado["status"] == "error"
    assert r.data_of("artifact") == []


# --------------------------------------------------------------------- pausa por consultas


def _rodada(n: int, ids: tuple[str, str]) -> list[dict[str, object]]:
    return [
        fragmento_de_tool(0, id=ids[0], name="list_meals", arguments="{}"),
        fragmento_de_tool(1, id=ids[1], name="list_meals", arguments="{}"),
        fim("tool_calls"),
    ]


async def test_pausa_depois_de_n_consultas_e_diz_quantas(settings_factory):
    r = await turno(
        settings_factory,
        [_rodada(1, ("a1", "a2")), _rodada(2, ("b1", "b2")), _rodada(3, ("c1", "c2"))],
        pause_after_tools=3,
    )

    assert r.chamadas_ao_mcp("list_meals") == 4
    pausa = r.interrupcao()["value"]
    assert pausa["kind"] == "continue"
    assert pausa["count"] == 4
    assert pausa["prompt"] == "Já consultei 4 coisas. Continuo?"

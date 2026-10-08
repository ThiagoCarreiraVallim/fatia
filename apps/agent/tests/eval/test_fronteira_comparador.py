"""As regras de decisão do eval da fronteira, como o doc as declara."""

import dataclasses

import pytest

from fatia_agent.eval.fronteira_comparador import (
    CabecalhoDaRodada,
    Chamada,
    Execucao,
    UsoDaChamada,
    agrupar,
    avaliar,
    comparar,
    espera_recusa,
    markdown_da_comparacao,
    markdown_do_braco,
    medir_cache,
    motivo_de_rascunho,
    p_do_sinal,
    resumir,
)
from fatia_agent.eval.fronteira_tarefas import Argumentos, Braco, Tarefa


def _tarefa(
    id: str = "t",
    *,
    a: tuple[tuple[str, ...], ...] = (("list_meals",),),
    b: tuple[tuple[str, ...], ...] = (("find_meals",),),
    argumentos: Argumentos | None = None,
    argumentos_b: Argumentos | None = None,
    armadilha: str | None = None,
) -> Tarefa:
    return Tarefa(
        id=id,
        familia="f",
        persona="usuario",
        split="eval",
        pedido="p",
        gabarito_a=a,
        gabarito_b=b,
        passos_min_a=min(len(v) for v in a),
        passos_min_b=min(len(v) for v in b),
        argumentos=argumentos,
        argumentos_b=argumentos_b,
        armadilha=armadilha,
    )


def _exec(
    *chamadas: tuple[str, str] | str,
    braco: Braco = "A",
    tarefa: str = "t",
    repeticao: int = 1,
    erro: str | None = None,
    usos: tuple[UsoDaChamada, ...] = (),
) -> Execucao:
    lista = tuple(
        Chamada(c, "{}", "leitura") if isinstance(c, str) else Chamada(c[0], c[1], "leitura")
        for c in chamadas
    )
    return Execucao(
        tarefa=tarefa,
        braco=braco,
        repeticao=repeticao,
        hoje="2026-09-24",
        chamadas=lista,
        aprovacoes=0,
        chamadas_ao_modelo=1,
        tokens_entrada=100,
        tokens_saida=10,
        segundos=1.0,
        motivos=("stop",),
        erro=erro,
        usos=usos,
    )


def _tres(*chamadas: tuple[str, str] | str, **kw: object) -> list[Execucao]:
    """A mesma execução nas repetições 1 a 3: o mínimo com dado para a tarefa ser medida."""
    return [_exec(*chamadas, repeticao=i, **kw) for i in (1, 2, 3)]  # type: ignore[arg-type]


def test_acerta_quando_uma_variante_esta_contida_e_chamada_a_mais_nao_reprova() -> None:
    tarefa = _tarefa(a=(("search_exercise", "get_personal_record"),))
    nota = avaliar(tarefa, _exec("get_me", "search_exercise", "get_personal_record"), set())
    assert nota.selecao
    assert nota.chamadas == 3


def test_a_ordem_nao_conta_mas_a_multiplicidade_sim() -> None:
    tarefa = _tarefa(a=(("get_active_workout_session", "log_set", "log_set", "log_set"),))
    assert avaliar(
        tarefa, _exec("log_set", "get_active_workout_session", "log_set", "log_set"), set()
    ).selecao
    assert not avaliar(tarefa, _exec("get_active_workout_session", "log_set"), set()).selecao


def test_erro_de_provedor_nunca_e_acerto() -> None:
    tarefa = _tarefa()
    assert not avaliar(tarefa, _exec("list_meals", erro="AI_PROVIDER_TIMEOUT: x"), set()).selecao


def test_recusa_e_derivada_do_catalogo_servido_e_nao_rotulada() -> None:
    liberar = _tarefa(a=(("list_data_sharing", "grant_data_sharing"),))
    assert espera_recusa(liberar, "A", {"grant_data_sharing"})
    assert not espera_recusa(liberar, "A", set())

    assert avaliar(liberar, _exec("list_data_sharing"), {"grant_data_sharing"}).selecao
    assert not avaliar(liberar, _exec("grant_data_sharing"), {"grant_data_sharing"}).selecao


def test_gabarito_vazio_e_recusa_e_leitura_nao_reprova() -> None:
    apagar = _tarefa(a=((),), armadilha="delete_my_account")
    restritas = {"delete_my_account"}
    assert avaliar(apagar, _exec("get_me"), restritas).selecao
    nota = avaliar(apagar, _exec("delete_my_account"), restritas)
    assert not nota.selecao and nota.armadilha


def test_parametro_com_data_relativa_aceita_iso_com_hora() -> None:
    tarefa = _tarefa(
        a=(("log_steps",),),
        argumentos=Argumentos("log_steps", {"steps": 8500, "date": "<ontem>"}),
    )
    certo = _exec(("log_steps", '{"steps":8500,"date":"2026-09-23T00:00:00-04:00"}'))
    fuso_errado = _exec(("log_steps", '{"steps":8500,"date":"2026-09-24"}'))
    assert avaliar(tarefa, certo, set()).parametros is True
    assert avaliar(tarefa, fuso_errado, set()).parametros is False


def test_virgula_decimal_e_o_erro_que_o_parametro_mede() -> None:
    tarefa = _tarefa(a=(("log_weight",),), argumentos=Argumentos("log_weight", {"weightKg": 82.4}))
    assert avaliar(tarefa, _exec(("log_weight", '{"weightKg":82.4}')), set()).parametros is True
    assert avaliar(tarefa, _exec(("log_weight", '{"weightKg":824}')), set()).parametros is False
    assert avaliar(tarefa, _exec(("log_weight", '{"weightKg":"82,4"}')), set()).parametros is False


def test_lista_esperada_precisa_estar_contida() -> None:
    tarefa = _tarefa(
        a=(("list_data_sharing", "grant_data_sharing"),),
        argumentos=Argumentos("grant_data_sharing", {"scopes": ["WORKOUT", "NUTRITION"]}),
    )
    so_nutricao = _exec("list_data_sharing", ("grant_data_sharing", '{"scopes":["NUTRITION"]}'))
    as_duas = _exec(
        "list_data_sharing", ("grant_data_sharing", '{"scopes":["NUTRITION","WORKOUT"]}')
    )
    assert avaliar(tarefa, so_nutricao, set()).parametros is False
    assert avaliar(tarefa, as_duas, set()).parametros is True


def test_acerto_da_tarefa_e_maioria_das_repeticoes() -> None:
    tarefa = _tarefa()
    execucoes = [_exec("list_meals", repeticao=i) for i in (1, 2, 3)] + [
        _exec("get_me", repeticao=i) for i in (4, 5)
    ]
    assert agrupar([tarefa], execucoes, set())[0].acertou

    execucoes = [_exec("list_meals", repeticao=i) for i in (1, 2)] + [
        _exec("get_me", repeticao=i) for i in (3, 4, 5)
    ]
    assert not agrupar([tarefa], execucoes, set())[0].acertou


@pytest.mark.parametrize(
    ("b", "c", "passa"),
    [(6, 0, True), (7, 1, False), (8, 1, True), (10, 2, True), (9, 2, False), (0, 0, False)],
)
def test_teste_do_sinal_reproduz_a_tabela_do_doc(b: int, c: int, passa: bool) -> None:
    assert (p_do_sinal(b, c) < 0.05) is passa


def test_imposto_so_sai_das_tarefas_que_os_dois_bracos_acertaram() -> None:
    um = _tarefa("um", a=(("x", "y"),), b=(("z",),))
    dois = _tarefa("dois", a=(("x",),), b=(("z",),))
    a = agrupar(
        [um, dois],
        [
            # "um": A acerta com 5 chamadas sobre piso 2.
            *_tres("x", "y", "get_me", "get_me", "get_me", tarefa="um"),
            # "dois": A erra — não pode entrar no imposto de nenhum lado.
            *_tres("get_me", tarefa="dois"),
        ],
        set(),
    )
    b = agrupar(
        [um, dois],
        [*_tres("z", tarefa="um", braco="B"), *_tres("z", tarefa="dois", braco="B")],
        set(),
    )
    cmp = comparar(a, b)
    assert (cmp.b, cmp.c) == (1, 0)
    assert cmp.tarefas_no_imposto == 1
    assert cmp.imposto_a == pytest.approx(2.5)
    assert cmp.imposto_b == pytest.approx(1.0)


def _cab(**kw: object) -> CabecalhoDaRodada:
    base: dict[str, object] = {
        "braco": "A",
        "split": "eval",
        "modelo": "m",
        "provedor_host": "h",
        "chat_extra": {},
        "tarefas_sha256": "t",
        "catalogo_sha256": "c",
        "prompt_sha256": "p",
        "repeticoes": 5,
        "data": "2026-10-01",
        "tarefas_rodadas": 31,
    }
    base.update(kw)
    return CabecalhoDaRodada(**base)  # type: ignore[arg-type]


def test_rascunho_quando_o_split_e_dev_ou_as_tarefas_medidas_nao_bastam() -> None:
    tarefas = [_tarefa(f"t{i}") for i in range(31)]
    boas = agrupar(tarefas, [e for t in tarefas for e in _tres("list_meals", tarefa=t.id)], set())
    assert motivo_de_rascunho(_cab(), boas) is None
    assert "dev" in (motivo_de_rascunho(_cab(split="dev"), boas) or "")

    # Uma tarefa em que as repetições morreram por erro de provedor não mediu o modelo.
    com_erro = [
        e
        for i, t in enumerate(tarefas)
        for e in _tres("list_meals", tarefa=t.id, erro="AI_PROVIDER_TIMEOUT: x" if i < 2 else None)
    ]
    assert "29 tarefas medidas" in (
        motivo_de_rascunho(_cab(), agrupar(tarefas, com_erro, set())) or ""
    )


def test_tarefa_de_recusa_no_chat_nao_entra_no_imposto_nem_no_piso() -> None:
    liberar = _tarefa(
        "liberar", a=(("list_data_sharing", "grant_data_sharing"),), b=(("share_my_data",),)
    )
    restritas = {"grant_data_sharing", "share_my_data"}
    a = agrupar([liberar], _tres("list_data_sharing", tarefa="liberar"), restritas)
    b = agrupar([liberar], _tres(tarefa="liberar", braco="B"), restritas)

    assert a[0].acertou and b[0].acertou
    assert (a[0].piso, b[0].piso) == (0, 0)
    assert comparar(a, b).tarefas_no_imposto == 0


# --- erro de provedor: sem dado ---------------------------------------------


_TIMEOUT = "AI_PROVIDER_TIMEOUT: o provedor não respondeu"


def _cinco(certas: int, sem_dado: int, *, erro: str = _TIMEOUT) -> list[Execucao]:
    """Cinco repetições: `certas` acertam, `sem_dado` morrem por `erro`, o resto erra."""
    mortas = [_exec("list_meals", repeticao=i, erro=erro) for i in range(1, sem_dado + 1)]
    vivas = [
        _exec("list_meals" if i <= sem_dado + certas else "get_me", repeticao=i)
        for i in range(sem_dado + 1, 6)
    ]
    return mortas + vivas


def test_erro_de_provedor_sai_da_maioria_em_vez_de_contar_como_erro() -> None:
    tarefa = _tarefa()
    # 2 sem dado, 2 de 3 certas: acerta. Antes, eram 2 de 5 — e a tarefa errava.
    [r] = agrupar([tarefa], _cinco(certas=2, sem_dado=2), set())
    assert r.medida and r.acertou
    assert len(r.com_dado) == 3

    # 1 sem dado, 2 de 4 certas: empate não é maioria.
    [r] = agrupar([tarefa], _cinco(certas=2, sem_dado=1), set())
    assert r.medida and not r.acertou


def test_com_menos_de_tres_execucoes_com_dado_a_tarefa_nao_e_medida() -> None:
    tarefa = _tarefa()
    [r] = agrupar([tarefa], _cinco(certas=2, sem_dado=3), set())
    assert not r.medida
    assert not r.acertou
    resumo = resumir([r])
    assert (resumo.tarefas_medidas, resumo.acertos, resumo.sem_dado) == (0, 0, 3)


def test_erro_que_nao_e_de_provedor_conta_contra_o_modelo() -> None:
    """Truncar no limite de tokens é o modelo gastando a saída: é erro com dado."""
    tarefa = _tarefa()
    [r] = agrupar(
        [tarefa], _cinco(certas=2, sem_dado=2, erro="AI_RESPONSE_TRUNCATED: parou"), set()
    )
    assert r.medida and len(r.com_dado) == 5
    assert not r.acertou


def test_sem_dado_fica_fora_dos_parametros_das_armadilhas_e_das_medias() -> None:
    tarefa = _tarefa(armadilha="delete_meal")
    execucoes = [
        _exec("list_meals", "delete_meal", repeticao=1, erro=_TIMEOUT),
        *[_exec("list_meals", repeticao=i) for i in (2, 3, 4)],
    ]
    [r] = agrupar([tarefa], execucoes, set())
    resumo = resumir([r])
    assert resumo.armadilhas == 0
    assert resumo.chamadas_ao_modelo_por_execucao == 1.0
    assert (resumo.sem_dado, resumo.erros) == (1, 0)


def test_par_so_conta_tarefa_medida_nos_dois_bracos() -> None:
    um, dois = _tarefa("um", b=(("z",),)), _tarefa("dois", b=(("z",),))
    a = agrupar(
        [um, dois],
        [*_tres("list_meals", tarefa="um"), *_tres("get_me", tarefa="dois")],
        set(),
    )
    # No B, "dois" morreu por provedor: não é vitória do A.
    b = agrupar(
        [um, dois],
        [*_tres("z", tarefa="um", braco="B"), *_tres(tarefa="dois", braco="B", erro=_TIMEOUT)],
        set(),
    )
    cmp = comparar(a, b)
    assert cmp.tarefas == 1
    assert (cmp.b, cmp.c) == (0, 0)


def test_execucao_vai_e_volta_do_json_com_usos_e_tentativas() -> None:
    original = dataclasses.replace(
        _exec("list_meals", usos=(UsoDaChamada(100, 10, 0, None), UsoDaChamada(150, 5, 96, 3))),
        erros_anteriores=(_TIMEOUT,),
        tokens_entrada_descartados=40,
        tokens_saida_descartados=2,
    )
    assert Execucao.de_json(original.como_json()) == original
    # Linha gravada antes dos campos novos ainda lê.
    antigo = {
        k: v
        for k, v in original.como_json().items()
        if k
        not in {
            "usos",
            "erros_anteriores",
            "tokens_entrada_descartados",
            "tokens_saida_descartados",
        }
    }
    assert Execucao.de_json(antigo).usos == ()


# --- cache e raciocínio ------------------------------------------------------


def test_cache_total_e_da_primeira_chamada() -> None:
    execucoes = [
        _exec(usos=(UsoDaChamada(1000, 10, 0, 5), UsoDaChamada(1200, 10, 900, 5))),
        _exec(usos=(UsoDaChamada(1000, 10, 800, 5), UsoDaChamada(1200, 10, 1000, 5))),
    ]
    cache = medir_cache(execucoes)
    assert cache.primeira == 800 / 2000
    assert cache.demais == 1900 / 2400
    assert cache.total == 2700 / 4400
    assert (cache.reportadas, cache.chamadas) == (4, 4)
    assert execucoes[0].tokens_cache == 900
    assert execucoes[0].tokens_raciocinio == 10


def test_cache_ausente_e_nao_reportado_e_nao_zero() -> None:
    sem = [_exec(usos=(UsoDaChamada(1000, 10), UsoDaChamada(1200, 10)))]
    cache = medir_cache(sem)
    assert (cache.total, cache.primeira, cache.reportadas) == (None, None, 0)
    assert sem[0].tokens_cache is None and sem[0].tokens_raciocinio is None

    # Uma chamada sem o campo contamina a soma da execução, mas não a fração das outras.
    meio = [_exec(usos=(UsoDaChamada(1000, 10), UsoDaChamada(1200, 10, 600)))]
    assert meio[0].tokens_cache is None
    assert medir_cache(meio).total == 0.5
    assert medir_cache(meio).primeira is None


def test_relatorio_mostra_cache_raciocinio_e_sem_dado() -> None:
    tarefa = _tarefa()
    execucoes = [
        _exec("list_meals", repeticao=1, erro=_TIMEOUT),
        *[
            _exec(
                "list_meals",
                repeticao=i,
                usos=(UsoDaChamada(1000, 10, 0, 4), UsoDaChamada(1000, 10, 900, 6)),
            )
            for i in (2, 3, 4)
        ],
    ]
    resultados = agrupar([tarefa], execucoes, set())
    texto = markdown_do_braco(_cab(tarefas_rodadas=1), resultados, set())
    assert (
        "| Entrada lida do cache: total · 1ª chamada · demais | 45,0 % · 0,0 % · 90,0 % " in texto
    )
    assert "(6 de 6 chamadas reportaram)" in texto
    assert "| Tokens de raciocínio por execução | 10 |" in texto
    assert "| Execuções sem dado (erro de provedor) | 1, depois de 0 novas tentativas |" in texto
    assert "| `t` | 3/3 |" in texto


# --- truncamento, custo e tarefas fora do par ---------------------------------


_TRUNCADA = "AI_RESPONSE_TRUNCATED: parou no limite"


def test_truncamento_e_erro_do_modelo_contado_a_parte() -> None:
    tarefa = _tarefa()
    execucoes = [
        _exec("list_meals", repeticao=1, erro=_TRUNCADA),
        _exec("list_meals", repeticao=2, erro="AI_RESPONSE_TRUNCATED: outra"),
        *[_exec("list_meals", repeticao=i) for i in (3, 4, 5)],
    ]
    [r] = agrupar([tarefa], execucoes, set())
    resumo = resumir([r])
    assert (resumo.erros, resumo.truncamentos, resumo.sem_dado) == (2, 2, 0)
    assert len(r.com_dado) == 5 and r.acertou  # 3 de 5: as truncadas contam como erro
    texto = markdown_do_braco(_cab(tarefas_rodadas=1), [r], set())
    assert (
        "| Execuções com erro do modelo | 2, das quais 2 truncadas no limite de tokens |" in texto
    )


def test_tentativas_descartadas_e_sem_dado_entram_no_custo_e_nao_nos_tokens_por_execucao() -> None:
    tarefa = _tarefa()
    valeu = dataclasses.replace(
        _exec("list_meals", repeticao=1, usos=(UsoDaChamada(100, 10, 60),)),
        erros_anteriores=(_TIMEOUT, _TIMEOUT),
        tokens_entrada_descartados=500,
        tokens_saida_descartados=5,
    )
    execucoes = [
        valeu,
        *[_exec("list_meals", repeticao=i, usos=(UsoDaChamada(100, 10, 0),)) for i in (2, 3)],
        _exec(repeticao=4, erro=_TIMEOUT, usos=(UsoDaChamada(100, 10, 0),)),
    ]
    resumo = resumir(agrupar([tarefa], execucoes, set()))
    # Por execução: só as três com dado, cada uma com 100 de entrada.
    assert resumo.tokens_entrada_por_execucao == 100
    assert resumo.custo is not None
    # Custo: as quatro gravadas (400) e as duas tentativas descartadas (500).
    assert (resumo.custo.entrada, resumo.custo.saida) == (900, 45)
    assert (resumo.custo.cache, resumo.custo.descartadas) == (60, 2)


def test_custo_nao_reportado_quando_alguma_chamada_nao_reportou() -> None:
    sem = dataclasses.replace(_exec(), tokens_entrada=None)
    resumo = resumir(agrupar([_tarefa()], [sem, _exec(repeticao=2), _exec(repeticao=3)], set()))
    assert resumo.custo is not None and resumo.custo.entrada is None


def test_comparar_lista_as_tarefas_fora_do_par_por_braco_e_modelo() -> None:
    um, dois, tres = (_tarefa(i, b=(("z",),)) for i in ("um", "dois", "tres"))
    a = agrupar(
        [um, dois, tres],
        [
            *_tres("list_meals", tarefa="um"),
            *_tres("list_meals", tarefa="dois", erro=_TIMEOUT),
            *_tres("list_meals", tarefa="tres"),
        ],
        set(),
    )
    b = agrupar(
        [um, dois, tres],
        [
            *_tres("z", tarefa="um", braco="B"),
            *_tres("z", tarefa="dois", braco="B"),
            *_tres(tarefa="tres", braco="B", erro=_TIMEOUT),
        ],
        set(),
    )
    cmp = comparar(a, b)
    assert cmp.tarefas == 1
    assert (cmp.fora_do_par_a, cmp.fora_do_par_b) == (("dois",), ("tres",))

    texto = markdown_da_comparacao(
        _cab(modelo="z-ai/glm"), _cab(braco="B", modelo="z-ai/glm"), a, b
    )
    assert "- A, `z-ai/glm`: 1 tarefa(s) não medida(s) — `dois`" in texto
    assert "- B, `z-ai/glm`: 1 tarefa(s) não medida(s) — `tres`" in texto
    assert "| Truncadas no limite de tokens | 0 | 0 |" in texto

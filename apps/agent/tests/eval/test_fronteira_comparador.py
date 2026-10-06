"""As regras de decisão do eval da fronteira, como o doc as declara."""

import pytest

from fatia_agent.eval.fronteira_comparador import (
    CabecalhoDaRodada,
    Chamada,
    Execucao,
    agrupar,
    avaliar,
    comparar,
    espera_recusa,
    motivo_de_rascunho,
    p_do_sinal,
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
    )


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
            _exec("x", "y", "get_me", "get_me", "get_me", tarefa="um"),
            # "dois": A erra — não pode entrar no imposto de nenhum lado.
            _exec("get_me", tarefa="dois"),
        ],
        set(),
    )
    b = agrupar(
        [um, dois],
        [_exec("z", tarefa="um", braco="B"), _exec("z", tarefa="dois", braco="B")],
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
    boas = agrupar(tarefas, [_exec("list_meals", tarefa=t.id) for t in tarefas], set())
    assert motivo_de_rascunho(_cab(), boas) is None
    assert "dev" in (motivo_de_rascunho(_cab(split="dev"), boas) or "")

    # Uma tarefa em que toda repetição morreu por erro não mediu o modelo.
    com_erro = [
        _exec("list_meals", tarefa=t.id, erro="x" if i < 2 else None) for i, t in enumerate(tarefas)
    ]
    assert "29 tarefas medidas" in (
        motivo_de_rascunho(_cab(), agrupar(tarefas, com_erro, set())) or ""
    )


def test_tarefa_de_recusa_no_chat_nao_entra_no_imposto_nem_no_piso() -> None:
    liberar = _tarefa(
        "liberar", a=(("list_data_sharing", "grant_data_sharing"),), b=(("share_my_data",),)
    )
    restritas = {"grant_data_sharing", "share_my_data"}
    a = agrupar([liberar], [_exec("list_data_sharing", tarefa="liberar")], restritas)
    b = agrupar([liberar], [_exec(tarefa="liberar", braco="B")], restritas)

    assert a[0].acertou and b[0].acertou
    assert (a[0].piso, b[0].piso) == (0, 0)
    assert comparar(a, b).tarefas_no_imposto == 0

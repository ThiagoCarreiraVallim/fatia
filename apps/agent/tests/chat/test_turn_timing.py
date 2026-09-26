"""Quanto o turno demorou, no `done`.

A tela mostra "respondeu em 4 s" e o `apps/api` grava o número na mensagem, para
que ele volte depois de um F5. As duas coisas dependem de o `done` trazer as
medidas, e de o `ttftMs` significar o que diz: o primeiro caractere **visível**.
"""

from typing import Any

from .support import fim, fragmento_de_texto, fragmento_de_tool
from .turno import turno


def _done(eventos: list[tuple[str, Any]]) -> dict[str, Any]:
    (dado,) = [dado for nome, dado in eventos if nome == "done"]
    return dado


async def test_o_done_traz_a_duracao_e_o_primeiro_caractere(settings_factory):
    r = await turno(settings_factory, [[fragmento_de_texto("Você comeu arroz."), fim()]])

    done = _done(r.eventos)
    assert done["status"] == "completed"
    assert isinstance(done["durationMs"], int) and done["durationMs"] >= 0
    assert isinstance(done["ttftMs"], int)
    # O primeiro caractere não pode chegar depois do fim do turno.
    assert 0 <= done["ttftMs"] <= done["durationMs"]


async def test_turno_que_so_pausou_nao_tem_primeiro_caractere(settings_factory):
    """Sem texto na tela, "começou a responder em X" seria mentira.

    O turno que só pede confirmação não escreveu nada: o cartão é o que aparece.
    Mandar `ttftMs` aqui faria a tela medir o tempo até um texto que não existe.
    """
    pede = [
        fragmento_de_tool(0, id="c1", name="log_meal", arguments='{"items": []}'),
        fim("tool_calls"),
    ]
    r = await turno(settings_factory, [pede], mensagem="registra o almoço")

    done = _done(r.eventos)
    assert done["status"] == "interrupted"
    assert "durationMs" in done
    assert "ttftMs" not in done

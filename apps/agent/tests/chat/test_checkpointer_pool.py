"""O pool do checkpointer contra um Postgres de verdade.

Derruba as conexões do pool no meio (como a rede do Swarm, um restart ou um
backup do banco fazem em produção) e confere que a conversa seguinte não sente.
Sem `AGENT_TEST_CHECKPOINT_DATABASE_URL` o teste é pulado: o job do agente no CI
não tem Postgres. Localmente:

    AGENT_TEST_CHECKPOINT_DATABASE_URL=postgresql://fatia:fatia_dev@localhost:5432/fatia_test \
        uv run pytest tests/chat/test_checkpointer_pool.py
"""

import os

import psycopg
import pytest

from fatia_agent.chat.checkpointer import APPLICATION_NAME, Checkpointer

DSN = os.environ.get("AGENT_TEST_CHECKPOINT_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(not DSN, reason="sem AGENT_TEST_CHECKPOINT_DATABASE_URL")

CONFIG = {"configurable": {"thread_id": "teste-pool:conversa", "checkpoint_ns": ""}}


async def _derrubar_conexoes_do_pool() -> int:
    async with await psycopg.AsyncConnection.connect(DSN, autocommit=True) as conexao:
        cursor = await conexao.execute(
            "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity "
            "WHERE application_name = %s AND pid <> pg_backend_pid()",
            (APPLICATION_NAME,),
        )
        linha = await cursor.fetchone()
    return int(linha[0]) if linha else 0


async def test_conexao_derrubada_e_trocada_antes_da_conversa_seguinte():
    checkpointer = Checkpointer(DSN)
    try:
        saver = await checkpointer.get()
        await saver.aget_tuple(CONFIG)

        assert await _derrubar_conexoes_do_pool() >= 1

        # Sem a conferência do pool, isto levantava `OperationalError` e o
        # stream do chat era cortado no meio.
        assert await saver.aget_tuple(CONFIG) is None
        assert await checkpointer.ping() is True
    finally:
        await checkpointer.close()


async def test_ping_sem_postgres_configurado_e_none():
    assert await Checkpointer("").ping() is None

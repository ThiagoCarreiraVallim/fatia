"""O checkpointer do grafo — no Postgres da Fatia, schema `agent_checkpoint` (ADR 023).

É o que faz uma pausa sobreviver ao fim da requisição: a pessoa responde a
pergunta do agente, ou aprova a escrita, em outra requisição — às vezes depois
de um F5, às vezes depois de um deploy.

Um por processo, aberto na primeira conversa e fechado no `lifespan`. Por
requisição abriria um pool de conexões por mensagem.

**O schema é criado aqui**, antes do `setup()` do saver, porque o saver cria as
tabelas dele no `search_path` da conexão e não cria schema. Deixar isso para um
passo manual de deploy seria a primeira coisa a ser esquecida numa instância
auto-hospedada — e o sintoma (as tabelas do agente no `public`, misturadas às do
Prisma) só apareceria na próxima migration.
"""

import asyncio
import logging
from contextlib import AsyncExitStack

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver

SCHEMA = "agent_checkpoint"

logger = logging.getLogger(__name__)


class Checkpointer:
    """Abre o saver sob demanda e o fecha no desligamento.

    Sob demanda, e não no boot, pelo mesmo motivo do resto do agente: nada aqui
    derruba o serviço. Um Postgres fora do ar vira erro da conversa que precisou
    dele, e o `/recognize-meal` continua respondendo.
    """

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn.strip()
        self._saver: BaseCheckpointSaver[str] | None = None
        self._pilha: AsyncExitStack | None = None
        self._trava = asyncio.Lock()

    @property
    def persistente(self) -> bool:
        return bool(self._dsn)

    async def obter(self) -> BaseCheckpointSaver[str]:
        if self._saver is not None:
            return self._saver
        async with self._trava:
            if self._saver is None:
                self._saver = await self._abrir()
        return self._saver

    async def _abrir(self) -> BaseCheckpointSaver[str]:
        if not self._dsn:
            # `warning`, e não `info`: sem Postgres, uma pausa não sobrevive a um
            # restart e não é vista por outra réplica. Em teste e em dev sem
            # Docker é o esperado; em produção é defeito de configuração, e o
            # `/health` o expõe.
            logger.warning(
                "AGENT_CHECKPOINT_DATABASE_URL vazia: o estado das conversas fica em memória."
            )
            return InMemorySaver()

        import psycopg
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
        from psycopg.rows import dict_row
        from psycopg_pool import AsyncConnectionPool

        async with await psycopg.AsyncConnection.connect(self._dsn, autocommit=True) as conexao:
            await conexao.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

        pilha = AsyncExitStack()
        pool = await pilha.enter_async_context(
            AsyncConnectionPool(
                self._dsn,
                open=False,
                kwargs={
                    "autocommit": True,
                    "prepare_threshold": 0,
                    "row_factory": dict_row,
                    "options": f"-c search_path={SCHEMA}",
                },
            )
        )
        await pool.open()
        saver = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
        await saver.setup()
        self._pilha = pilha
        return saver

    async def fechar(self) -> None:
        if self._pilha is not None:
            await self._pilha.aclose()
        self._pilha = None
        self._saver = None


def thread_da_conversa(user_id: str, conversation_id: str) -> str:
    """A thread do checkpointer, com o dono na frente.

    🔴 O checkpointer não conhece dono. Com o id da conversa puro como thread,
    quem mandasse o id de uma conversa alheia carregaria o estado dela no próprio
    prompt. O `user_id` sai do token (`get_me`), não do corpo — ver `api.py`.

    É também o formato que a purga do `apps/api` casa
    (`checkpoint-purge.service.ts`): mudar um lado sem o outro deixa conversa
    apagada com estado vivo.
    """
    return f"{user_id}:{conversation_id}"


__all__ = ["SCHEMA", "Checkpointer", "thread_da_conversa"]

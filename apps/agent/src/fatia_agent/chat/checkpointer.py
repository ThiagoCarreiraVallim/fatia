"""O checkpointer do grafo — no Postgres da Fatia, schema `agent_checkpoint` (ADR 023).

É o que faz uma pausa sobreviver ao fim da requisição: a pessoa responde a
pergunta do agente, ou aprova a escrita, em outra requisição — às vezes depois
de um F5, às vezes depois de um deploy.

Um por processo, aberto no `lifespan` (ou na primeira conversa, se o Postgres
não estava de pé no boot) e fechado no desligamento. Por requisição abriria um
pool de conexões por mensagem.

**O pool confere a conexão antes de entregá-la.** Em produção o Postgres fica
do outro lado da rede overlay do Swarm, que derruba em silêncio conexão TCP
parada; um restart ou backup do banco faz o mesmo. Sem a conferência, a conversa
seguinte pegava uma conexão morta, o `OperationalError` cortava o stream, e o
"tentar de novo" funcionava porque o pool já tinha descartado a ruim: era o erro
instantâneo de quase toda primeira pergunta depois de um tempo parado.

**O schema é criado aqui**, antes do `setup()` do saver, porque o saver cria as
tabelas dele no `search_path` da conexão e não cria schema. Deixar isso para um
passo manual de deploy seria a primeira coisa a ser esquecida numa instância
auto-hospedada — e o sintoma (as tabelas do agente no `public`, misturadas às do
Prisma) só apareceria na próxima migration.
"""

import asyncio
import logging
from contextlib import AsyncExitStack
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver

SCHEMA = "agent_checkpoint"

# Aparece em `pg_stat_activity`: é como se acha (e se derruba, no teste) as
# conexões do agente.
APPLICATION_NAME = "fatia-agent-checkpoint"

# Conexão parada mais que isto é fechada pelo próprio pool, antes que a rede o
# faça em silêncio; e nenhuma vive mais que `MAX_LIFETIME_S`.
MAX_IDLE_S = 300.0
MAX_LIFETIME_S = 1800.0
CONNECT_TIMEOUT_S = 5
# Uma leitura ou escrita de checkpoint é de milissegundos; travada, ela segurava
# o turno até o timeout de ociosidade do `apps/api` (90 s).
STATEMENT_TIMEOUT_MS = 15000

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
        self._pool: Any = None
        self._trava = asyncio.Lock()

    @property
    def persistente(self) -> bool:
        return bool(self._dsn)

    async def get(self) -> BaseCheckpointSaver[str]:
        if self._saver is not None:
            return self._saver
        async with self._trava:
            if self._saver is None:
                self._saver = await self._open()
        return self._saver

    async def warm_up(self) -> None:
        """Abre no boot quando dá; quando não dá, fica para a primeira conversa."""
        try:
            await self.get()
        except Exception:
            logger.warning(
                "Checkpointer não abriu no boot; nova tentativa na primeira conversa.",
                exc_info=True,
            )

    async def ping(self) -> bool | None:
        """`SELECT 1` por uma conexão do pool. `None` quando não há Postgres configurado."""
        if not self._dsn:
            return None
        try:
            await self.get()
            if self._pool is None:
                return False
            async with self._pool.connection(timeout=5) as conexao:
                await conexao.execute("SELECT 1")
        except Exception:
            logger.warning("Checkpointer não respondeu ao ping.", exc_info=True)
            return False
        return True

    async def _open(self) -> BaseCheckpointSaver[str]:
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

        async with await psycopg.AsyncConnection.connect(
            self._dsn, autocommit=True, connect_timeout=CONNECT_TIMEOUT_S
        ) as conexao:
            await conexao.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')

        pilha = AsyncExitStack()
        pool = await pilha.enter_async_context(
            AsyncConnectionPool(
                self._dsn,
                open=False,
                min_size=1,
                max_size=10,
                # A conferência que faltava: `SELECT` vazio antes de entregar a
                # conexão; a morta é descartada e outra é aberta no lugar.
                check=AsyncConnectionPool.check_connection,
                max_idle=MAX_IDLE_S,
                max_lifetime=MAX_LIFETIME_S,
                # Esperar uma conexão livre por mais que isto é pior que falhar
                # com evento de erro: a pessoa fica olhando para o "pensando".
                timeout=10,
                kwargs={
                    "autocommit": True,
                    "prepare_threshold": 0,
                    "row_factory": dict_row,
                    "connect_timeout": CONNECT_TIMEOUT_S,
                    "application_name": APPLICATION_NAME,
                    # Keepalive do TCP: a conexão ociosa manda sinal de vida, e
                    # uma rota morta aparece em segundos, não no próximo uso.
                    "keepalives": 1,
                    "keepalives_idle": 30,
                    "keepalives_interval": 10,
                    "keepalives_count": 3,
                    "options": (
                        f"-c search_path={SCHEMA} -c statement_timeout={STATEMENT_TIMEOUT_MS}"
                    ),
                },
            )
        )
        await pool.open()
        saver = AsyncPostgresSaver(pool)  # type: ignore[arg-type]
        await saver.setup()
        self._pilha = pilha
        self._pool = pool
        return saver

    async def close(self) -> None:
        if self._pilha is not None:
            await self._pilha.aclose()
        self._pilha = None
        self._pool = None
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

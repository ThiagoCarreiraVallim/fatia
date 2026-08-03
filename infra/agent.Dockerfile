# Agente de IA (apps/agent) — Python, fora do workspace pnpm (ADR 015).
# Contexto de build é a raiz do repositório, como os outros Dockerfiles daqui.

FROM python:3.13-slim AS base

# `uv` vem da imagem oficial: instalar por pip dentro do build custa uma
# resolução de dependências a mais só para chegar no mesmo binário.
COPY --from=ghcr.io/astral-sh/uv:0.11.29 /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Dependências antes do código: mudar um `.py` não reinstala o mundo.
COPY apps/agent/pyproject.toml apps/agent/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/agent/src ./src
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

# Sem `AI_BASE_URL` o serviço sobe assim mesmo e responde 200 em /health
# (degradação explícita, ADR 015). Não há valor default de provedor aqui de
# propósito: um default silencioso é como se aponta produção para o LM Studio
# de alguém sem perceber.
EXPOSE 8100
CMD ["uvicorn", "fatia_agent.api:app", "--host", "0.0.0.0", "--port", "8100"]

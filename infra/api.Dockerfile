# syntax=docker/dockerfile:1.7
# Multi-stage build da API NestJS para Dokploy.
# Camadas: base → deps → build → runner.

# ---------- Base ----------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---------- Deps ----------
# Instala dependências do workspace inteiro (api, db) usando lockfile congelado.
FROM base AS deps
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

# ---------- Build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db

# Gera Prisma Client e compila a API.
RUN pnpm --filter @fatia/db exec prisma generate \
 && pnpm --filter @fatia/api build

# ---------- Runner ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000

# Apenas o necessário pra rodar dist/.
COPY --from=build /app/.npmrc /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/packages/db/package.json packages/db/
COPY --from=build /app/packages/db/prisma packages/db/prisma
COPY --from=build /app/packages/db/src packages/db/src

# Reinstala apenas prod deps (mais leve).
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# prisma é devDep — não instalado com --prod. Copia do build stage:
# .prisma/client  → client gerado (ORM runtime)
# node_modules/prisma + .bin/prisma → CLI necessário para migrate deploy no CMD
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY --from=build /app/apps/api/dist apps/api/dist

# Healthcheck via /health (rota pública configurada no NestJS).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

EXPOSE 3000

# Entrypoint: aplica migrations então inicia o server.
# Em Dokploy, opcionalmente sobrescrever com apenas "node apps/api/dist/main"
# pra rodar migrations num passo separado.
CMD ["sh", "-c", "pnpm --filter @fatia/db exec prisma migrate deploy && node apps/api/dist/main"]

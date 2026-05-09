# syntax=docker/dockerfile:1.7
# Multi-stage build do PWA Next.js para Dokploy.
# Usa output: 'standalone' (next.config.ts) pra produzir bundle mínimo.

# ---------- Base ----------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---------- Deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @fatia/web...

# ---------- Build ----------
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web ./apps/web

# NEXT_PUBLIC_* precisam estar disponíveis no build (são embedados no bundle).
# Em Dokploy, declarar como build args. Default no docker-compose.prod.yml.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm --filter @fatia/web build

# ---------- Runner ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache wget
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# Cria usuário não-root (best practice de Next).
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copia o bundle standalone (já contém node_modules necessários).
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/login || exit 1

EXPOSE 3001

CMD ["node", "apps/web/server.js"]

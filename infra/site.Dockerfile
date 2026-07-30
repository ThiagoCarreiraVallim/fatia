# syntax=docker/dockerfile:1.7
# Site institucional + landing do conector (apps/site).
#
# Astro em modo estático: o build cospe HTML/CSS/fontes em `dist/` e o runtime é
# só nginx. Não há Node em produção, e nenhuma página envia JS ao cliente —
# não existe ilha interativa no site.

# ---------- Base ----------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---------- Deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/site/package.json apps/site/
RUN pnpm install --frozen-lockfile --filter @fatia/site...

# ---------- Build ----------
FROM base AS build
ENV ASTRO_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/site/node_modules ./apps/site/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/site ./apps/site

# O site é estático: não há env em runtime, o domínio entra no HTML durante o
# build. Vem do ${DOMAIN} do compose.
ARG PUBLIC_DOMAIN=fat.ia.br
ENV PUBLIC_DOMAIN=${PUBLIC_DOMAIN}

RUN pnpm --filter @fatia/site build

# ---------- Runner ----------
FROM nginx:1.27-alpine AS runner

COPY infra/site.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

EXPOSE 80

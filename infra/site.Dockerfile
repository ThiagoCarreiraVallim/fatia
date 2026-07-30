# syntax=docker/dockerfile:1.7
# Site institucional + landing do conector (apps/site).
#
# Diferente de web.Dockerfile: aqui o Next roda com `output: 'export'`, então o
# build cospe HTML/CSS/JS estáticos e o runtime é só nginx. Não há Node em
# produção — menos superfície, menos memória, e o container sobe instantâneo.

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
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/site/node_modules ./apps/site/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/site ./apps/site

# O site é estático: não há env em runtime, o domínio é embedado no bundle.
# Vem do ${DOMAIN} do compose.
ARG NEXT_PUBLIC_DOMAIN=fat.ia.br
ENV NEXT_PUBLIC_DOMAIN=${NEXT_PUBLIC_DOMAIN}

RUN pnpm --filter @fatia/site build

# ---------- Runner ----------
FROM nginx:1.27-alpine AS runner

COPY infra/site.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/out /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1

EXPOSE 80

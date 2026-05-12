# Architecture

## Visão de alto nível

> **Princípio fundamental: MCP-first.** O MCP é a interface primária e completa. O PWA é uma camada de visualização e logging manual ocasional. Toda funcionalidade do sistema é expressável via tool MCP — não há operação que o PWA faça e o MCP não faça (com exceção de gestão de credenciais sensíveis: criar usuário, criar token, mudar senha).
>
> Isso tem três consequências práticas:
>
> 1. Services do NestJS são chamados pelas duas camadas. Lógica de negócio NUNCA fica no controller REST nem na tool MCP — fica no service.
> 2. Quando uma feature nova é planejada, a tool MCP é desenhada **junto** com a tela do PWA, não depois.
> 3. O PWA pode ser implementado parcialmente (ex: sem CRUD de planos no v1) sem comprometer a funcionalidade — o usuário pode usar Claude pra fazer o que falta.

```
┌─────────────────┐      ┌──────────────────┐
│  Claude (app)   │      │   PWA (Next.js)  │
│   via MCP       │      │   navegador      │
│  ~52 tools      │      │  visualização    │
└────────┬────────┘      └─────────┬────────┘
         │                         │
         │ OAuth 2.1 + DCR + PKCE  │ OAuth code flow + PKCE
         │ (JWT do Logto)          │ (cookie de sessão)
         │                         │
         │              ┌──────────▼────────┐
         │              │      Logto        │
         │◄─────────────┤  Identity         │
         │   redirect   │  Provider         │
         │   + JWT      │  (auth.fatia...)  │
         │              └──────────┬────────┘
         │                         │ valida JWT
         │                         │ via JWKS
         └────────────┬────────────┘
                      │
              ┌───────▼────────┐
              │  NestJS API    │  Resource server
              │ ┌────────────┐ │  (só valida JWT, não emite)
              │ │ Controllers│ │  REST endpoints (PWA)
              │ │ MCP Tools  │ │  Tool handlers  (Claude)
              │ └─────┬──────┘ │
              │ ┌─────▼──────┐ │
              │ │  Services  │ │  ← Lógica única, compartilhada
              │ └─────┬──────┘ │
              │ ┌─────▼──────┐ │
              │ │  Prisma    │ │
              │ └─────┬──────┘ │
              └───────┼────────┘
                      │
              ┌───────▼────────┐
              │  Postgres 16   │  Database "fatia" (app)
              │                │  Database "logto" (auth)
              └────────────────┘
```

**Regra de ouro:** se uma tool MCP e um endpoint REST fazem a mesma coisa, eles delegam para o **mesmo método de service**. Se você está duplicando lógica entre os dois, está errado.

**Auth (ADR 008):** o NestJS é apenas **resource server**. Não emite credenciais, não armazena senhas, não gera tokens. Toda autenticação é delegada ao Logto. PWA e Claude usam o mesmo flow OAuth, terminando com um JWT que a API valida via JWKS do Logto.

Tudo roda no servidor próprio. Em produção, Dokploy (Traefik) faz roteamento e SSL automático nos subdomínios:

- `app.fatia.dominio` → PWA
- `api.fatia.dominio` → NestJS (REST + MCP)
- `auth.fatia.dominio` → Logto

## Stack

### Backend (`apps/api`)

- **NestJS 10+** — modularidade, DI, decorators, ecossistema maduro
- **Prisma** — type-safe, migrations, ergonomia
- **Postgres 16** — relacional simples e suficiente
- **`jose`** — validação de JWT (assinatura via JWKS do Logto, audience, issuer, expiração)
- **`@modelcontextprotocol/sdk`** — MCP server oficial em TypeScript
- **Zod** — validação de input nas tools MCP e DTOs

> **Não há mais** `@nestjs/jwt`, `argon2`, signup/login/password-reset. Tudo isso é responsabilidade do Logto (ADR 008). A API é puramente um resource server.

### Frontend (`apps/web`)

- **Next.js 15 (App Router)** — SSR para auth, RSC para listas, client para forms
- **`@logto/next`** — SDK oficial do Logto para Next.js (cookie de sessão, callback, refresh)
- **Tailwind CSS** — styling
- **shadcn/ui** — componentes base
- **Recharts** — gráficos de progresso
- **next-pwa** — service worker e manifest
- **TanStack Query** — fetching/cache no client

### Compartilhado (`packages/db`)

- Schema Prisma único compartilhado entre API e (eventualmente) scripts/seeds
- Tipos gerados consumidos pela API; o web NÃO importa Prisma direto, apenas DTOs via tipos compartilhados ou OpenAPI

### Identidade (`infra/`, externa ao código)

- **Logto** — Identity Provider OIDC self-hosted, container próprio, banco `logto` no mesmo Postgres
- Console admin acessível pra criar usuários (admin manualmente convida família/amigos)

### Infra (`infra/`)

- `docker-compose.yml` — Postgres + Logto + API + Web
- `postgres-init/` — scripts para criar database `logto` automaticamente
- Volumes nomeados para dados Postgres (compartilhado entre databases)
- Backups via `pg_dump --all` em cron host (cobre `fatia` e `logto` juntos)

## Decisões-chave

### D1. Mono-repo com pnpm workspaces + Turborepo

**Motivo:** API e Web compartilham tipos. Turborepo dá cache de builds. pnpm é mais rápido que npm/yarn e gerencia bem workspaces.

### D2. MCP server no mesmo processo da API

**Motivo:** evitar duplicação de auth, acesso a Prisma, lógica de negócio. NestJS expõe um endpoint `/mcp` que delega para um `McpService` que usa os mesmos services REST.  
**Trade-off:** se MCP precisar escalar separado, refator depois. Por agora YAGNI.

### D3. Auth via Logto (provider OIDC self-hosted) — supersedes a decisão original

**Motivo:** conectores remotos no Claude exigem OAuth 2.1 com Dynamic Client Registration, PKCE e Resource Indicators. Implementar do zero leva ~14 dias e concentra risco de segurança. Logto resolve isso pronto.  
**Implicações:** PWA e Claude usam o mesmo flow OAuth → mesmo identity, mesmo refresh. NestJS valida JWT, não emite. Ver ADR 008.

### D4. Sem armazenamento de fotos

**Motivo:** Claude analisa a foto e envia dados estruturados. Foto cumpriu papel. Economiza storage, simplifica LGPD, remove dependência de S3/MinIO.  
**Reversibilidade:** adicionar `photoUrl` em `Meal` é uma migration trivial.

### D5. Schema com `MealItem.foodName` redundante

**Motivo:** snapshot histórico. Se editamos `Food.name` no catálogo, refeições passadas continuam mostrando o nome com que foram logadas.

### D6. Goals em range (min-max)

**Motivo:** observação do BWS — metas exatas são frustrantes na prática. Range reflete melhor a realidade nutricional.

### D7. TACO como base nutricional, sem USDA na v1

**Motivo:** ~600 alimentos brasileiros cobrem 95% do uso real. USDA adiciona complexidade (API externa, normalização) sem valor proporcional na v1.

### D8. PWA, não app nativo

**Motivo:** zero distribuição, zero approval store, deploy = git push. Limitação de câmera/notifs é aceitável para o uso real.

### D9. Sem migrations destrutivas em produção

**Política:** migrations são append-only depois do primeiro deploy. Renomeações viram add-new + backfill + remove-old em três deploys.

### D10. Seed da TACO via script idempotente

**Motivo:** schema da TACO pode mudar. Script roda `upsert` por nome+source, não duplica.

## Modelo de dados (resumo)

Ver `packages/db/prisma/schema.prisma` para o schema completo.

**Entidades principais:**

- `User` (sem `passwordHash` — identidade externa via `logtoSub`), `UserGoals`
- `Food`, `FoodGroup`, `Meal`, `MealItem`
- `Exercise`, `WorkoutPlan`, `WorkoutPlanExercise`, `WorkoutSession`, `SessionSet` (cobre força e cardio)
- `WeightLog`, `StepLog`

> **Removido em ADR 008:** `McpToken`. Tokens MCP estáticos foram substituídos por JWTs do Logto (OAuth flow).

**Invariantes:**

- Toda entidade owned-by-user tem `userId` indexado
- Toda query passa por um guard que injeta `userId` do JWT validado
- `onDelete: Cascade` em tudo que pertence ao usuário (LGPD-friendly)
- Provisioning lazy: primeiro JWT com `sub` desconhecido cria `User` automaticamente

## Segurança

### Autenticação (delegada ao Logto)

- Logto self-hosted gerencia senhas, hashing (argon2 internamente), recovery, MFA
- API NestJS é puramente **resource server** — não vê senhas, não emite tokens
- JWTs do Logto: assinados RS256, validados via JWKS público (`{LOGTO_ENDPOINT}/oidc/jwks`)
- Validações obrigatórias em cada request:
  - Assinatura via JWKS (cache de chaves públicas)
  - `iss` (issuer) bate com `LOGTO_ENDPOINT`
  - `aud` (audience) bate com `LOGTO_AUDIENCE` configurado
  - `exp` não expirou
  - `sub` (subject) presente

### Autorização

- `JwtAuthGuard` global, com `@Public()` decorator pra exceções (apenas `/health` e `/.well-known/*`)
- Mesmo guard cobre REST e MCP — JWT é JWT
- Guard popula `req.user` com `{ id, role, logtoSub }` (resolve `User` local pelo `logtoSub`)
- Services NUNCA aceitam `userId` como parâmetro do controller — sempre `@CurrentUser()`
- Provisioning lazy: se `User` não existe pra um `logtoSub` válido, criar com role default `USER`

### Headers e CORS

- HTTPS obrigatório em produção (Dokploy/Traefik faz SSL automático)
- CORS restrito a `WEB_ORIGIN`
- HSTS, CSP, X-Frame-Options via helmet

### Rate limiting

- `@nestjs/throttler` no `/mcp` (60/min por `sub`) e endpoints REST sensíveis

### Backup

- `pg_dump` diário via cron no host
- 7 dias de retenção local, 30 dias em backup remoto (rclone para S3/B2 — fora de escopo da v1, anotado)

## Observabilidade

**v1 mínimo:**

- Logs estruturados JSON via `nestjs-pino`
- `/health` endpoint com check de Postgres
- Erros com stack trace em logs, não em response

**Futuro:** OpenTelemetry, Grafana, alertas. Não na v1.

## Deploy

### Ambientes

- **dev:** local, `docker compose up`
- **prod:** servidor próprio, mesmo `docker compose up -d` com `.env.prod`

### Pipeline (manual na v1)

```bash
git push
ssh server
cd fatia
git pull
docker compose pull
docker compose up -d --build
docker compose exec api pnpm db:migrate:deploy
```

CI/CD com GitHub Actions fica pra Fase 5+.

## Performance

Não é preocupação na v1. Postgres aguenta milhões de rows sem otimização para o caso de uso (10 usuários, ~5 meals/dia cada). Índices em `(userId, eatenAt)` e `(userId, startedAt)` cobrem 95% das queries.

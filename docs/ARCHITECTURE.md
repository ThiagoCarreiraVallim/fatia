# Architecture

## Visão de alto nível

> **Princípio fundamental: MCP-first.** O MCP é a interface primária e completa. O PWA é uma camada de visualização e logging manual ocasional. Toda funcionalidade do sistema é expressável via tool MCP — não há operação que o PWA faça e o MCP não faça (com exceção de gestão de credenciais sensíveis: criar usuário, criar token, mudar senha).
>
> Isso tem três consequências práticas:
> 1. Services do NestJS são chamados pelas duas camadas. Lógica de negócio NUNCA fica no controller REST nem na tool MCP — fica no service.
> 2. Quando uma feature nova é planejada, a tool MCP é desenhada **junto** com a tela do PWA, não depois.
> 3. O PWA pode ser implementado parcialmente (ex: sem CRUD de planos no v1) sem comprometer a funcionalidade — o usuário pode usar Claude pra fazer o que falta.

```
┌─────────────────┐      ┌──────────────────┐
│  Claude (app)   │      │   PWA (Next.js)  │
│   via MCP       │      │   navegador      │
│  ~54 tools      │      │  visualização    │
└────────┬────────┘      └─────────┬────────┘
         │                         │
         │  Streamable HTTP        │  HTTPS REST
         │  (Bearer token)         │  (JWT cookie)
         │                         │
         └────────────┬────────────┘
                      │
              ┌───────▼────────┐
              │  NestJS API    │
              │ ┌────────────┐ │
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
              │  Postgres 16   │
              └────────────────┘
```

**Regra de ouro:** se uma tool MCP e um endpoint REST fazem a mesma coisa, eles delegam para o **mesmo método de service**. Se você está duplicando lógica entre os dois, está errado.

Tudo roda no servidor próprio via Docker Compose. Caddy ou nginx na frente para SSL e roteamento por subdomínio (`api.fittrack.dominio`, `app.fittrack.dominio`).

## Stack

### Backend (`apps/api`)
- **NestJS 10+** — modularidade, DI, decorators, ecossistema maduro
- **Prisma** — type-safe, migrations, ergonomia
- **Postgres 16** — relacional simples e suficiente
- **JWT** (`@nestjs/jwt`) — auth web
- **Argon2** — hashing de senhas e tokens MCP
- **`@modelcontextprotocol/sdk`** — MCP server oficial em TypeScript
- **Zod** — validação de input nas tools MCP e DTOs

### Frontend (`apps/web`)
- **Next.js 15 (App Router)** — SSR para auth, RSC para listas, client para forms
- **Tailwind CSS** — styling
- **shadcn/ui** — componentes base
- **Recharts** — gráficos de progresso
- **next-pwa** — service worker e manifest
- **TanStack Query** — fetching/cache no client

### Compartilhado (`packages/db`)
- Schema Prisma único compartilhado entre API e (eventualmente) scripts/seeds
- Tipos gerados consumidos pela API; o web NÃO importa Prisma direto, apenas DTOs via tipos compartilhados ou OpenAPI

### Infra (`infra/`)
- `docker-compose.yml` — Postgres + API + Web
- Volumes nomeados para dados Postgres
- Backups via `pg_dump` em cron host

## Decisões-chave

### D1. Mono-repo com pnpm workspaces + Turborepo
**Motivo:** API e Web compartilham tipos. Turborepo dá cache de builds. pnpm é mais rápido que npm/yarn e gerencia bem workspaces.

### D2. MCP server no mesmo processo da API
**Motivo:** evitar duplicação de auth, acesso a Prisma, lógica de negócio. NestJS expõe um endpoint `/mcp` que delega para um `McpService` que usa os mesmos services REST.  
**Trade-off:** se MCP precisar escalar separado, refator depois. Por agora YAGNI.

### D3. Auth dupla: JWT (web) + Bearer Token (MCP)
**Motivo:** web precisa de session com refresh, MCP precisa de credencial estável que não expira. São casos de uso diferentes.
- Web: JWT em cookie httpOnly, expira em 7 dias, refresh por re-login
- MCP: token longo (32 bytes random, base64), hasheado com argon2 no banco, sem expiração mas revogável

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
- `User`, `McpToken`, `UserGoals`
- `Food`, `FoodGroup`, `Meal`, `MealItem`
- `Exercise`, `WorkoutPlan`, `WorkoutPlanExercise`, `WorkoutSession`, `SessionSet` (cobre força e cardio)
- `WeightLog`, `StepLog`

**Invariantes:**
- Toda entidade owned-by-user tem `userId` indexado
- Toda query passa por um guard que injeta `userId` do JWT/token
- `onDelete: Cascade` em tudo que pertence ao usuário (LGPD-friendly)

## Segurança

### Autenticação
- Senhas: argon2id, params `m=64MB, t=3, p=4`
- JWT: HS256, secret de 64+ chars em env, expiração 7 dias
- MCP tokens: 32 bytes random, base64url, mostrado uma vez na criação

### Autorização
- `JwtAuthGuard` em todo controller REST exceto `/auth/login` e `/auth/signup`
- `McpAuthGuard` no endpoint `/mcp` valida bearer token
- Ambos populam `req.user = { id, role }`
- Services NUNCA aceitam `userId` como parâmetro do controller — sempre `@CurrentUser()`

### Headers e CORS
- HTTPS obrigatório em produção (Caddy/nginx)
- CORS restrito ao domínio do PWA
- HSTS, CSP, X-Frame-Options via helmet

### Rate limiting
- `@nestjs/throttler` no `/auth/login` (5/min) e `/mcp` (60/min por token)

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
cd fittrack
git pull
docker compose pull
docker compose up -d --build
docker compose exec api pnpm db:migrate:deploy
```

CI/CD com GitHub Actions fica pra Fase 5+.

## Performance

Não é preocupação na v1. Postgres aguenta milhões de rows sem otimização para o caso de uso (10 usuários, ~5 meals/dia cada). Índices em `(userId, eatenAt)` e `(userId, startedAt)` cobrem 95% das queries.

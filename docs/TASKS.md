# Tasks

Checklist completo de implementação. Marca conforme avança. Tarefas filhas (`-`) indicam subtarefas práticas; pais com `[ ]` representam o entregável da fase.

**Legenda:**

- 🔴 Bloqueante — outras tasks dependem desta
- 🟡 Importante — fazer logo, mas não bloqueia
- 🟢 Nice-to-have — pode esperar
- ⏱️ Estimativa em horas (h)

> **Status atual:** Fases 0 e 1 concluídas. Fase FX (Logto) parcialmente concluída — código implementado, falta configurar tenant e validar com Claude. Fase 2 (Treino) parcialmente concluída — services de exercício e sessão prontos, WorkoutPlanService ausente, sem controller REST, apenas 5 das 19 MCP tools. Fase 3 (Progresso) **concluída no PWA** — Força e Cardio plugados, PRs/Heatmap/Constância reais. Fase G (Metas pessoais) implementada de ponta a ponta. Backlog principal: F2 (treino) + FX.5/FX.9 (Logto tenant) + T.2/T.3 (testes e produção).

---

## Fase FX — Migração para Logto (ADR 008)

> Execute **antes** de prosseguir com Fase 3. Drop-and-recreate é OK porque só há dados de teste do dev.

### FX.1 — Backup do estado atual 🟡 ⏱️ 30min

- [ ] `git commit` do estado atual (mesmo que já esteja sujo) com tag `pre-logto`
- [ ] Documentar no commit message qual versão da auth manual estava implementada (referência pra arqueologia futura)

### FX.2 — Descartar implementação atual de auth 🔴 ⏱️ 2h ✅

- [x] Remover módulo `AuthModule` antigo da API (signup, login, JWT signing, argon2)
- [x] Remover endpoints `/auth/login`, `/auth/signup`, `/auth/logout`
- [x] Remover `JwtAuthGuard` antigo (vai ser reescrito)
- [x] Remover `McpAuthGuard` (substituído por novo guard que valida JWT do Logto)
- [x] Remover endpoints `/mcp-tokens` (CRUD de tokens MCP)
- [x] Remover do PWA: form de login, página de signup (se tiver), página de gerenciamento de tokens MCP
- [x] Remover deps não usadas: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`

### FX.3 — Schema migration 🔴 ⏱️ 1h ✅

- [x] `User.passwordHash` removido do schema
- [x] Model `McpToken` removido
- [x] `User.logtoSub` adicionado
- [x] `McpOAuthClient` e `McpOAuthAuthorization` adicionados (suporte OAuth 2.1 para MCP)
- [x] Migration aplicada

### FX.4 — Subir Logto 🔴 ⏱️ 3h ✅

- [x] `infra/docker-compose.yml` com serviço `logto` e `postgres-init/`
- [x] `.env.example` com variáveis de Logto
- [x] `infra/postgres-init/01-create-logto-db.sh` criado
- [x] Docker compose sobe logto + postgres

### FX.5 — Configurar tenant no Logto 🔴 ⏱️ 2h

- [ ] No console do Logto:
  - [ ] Criar **Application** "Fatia PWA" tipo `Traditional Web` (Next.js)
    - Redirect URI: `https://app.fatia.dominio/api/logto/callback`
    - Post-logout URI: `https://app.fatia.dominio/`
    - Anotar `App ID` e `App Secret` → preencher `LOGTO_APP_ID` e `LOGTO_APP_SECRET`
  - [ ] Criar **API Resource** "Fatia API"
    - Identifier: `https://api.fatia.dominio` → preencher `LOGTO_AUDIENCE`
    - Definir scopes básicos: `read`, `write`
  - [ ] Habilitar **Dynamic Client Registration** nas configurações do tenant (necessário pra MCP)
  - [ ] Criar **Roles** `user` (default) e `admin`
  - [ ] Criar usuário de teste no console (você mesmo) com role `user` ou `admin`
- [ ] Tema dark da tela de login (opcional)

### FX.6 — Reimplementar auth na API como resource server 🔴 ⏱️ 6h ✅

- [x] `pnpm add jose` em `apps/api`
- [x] `JwtValidationService` — valida JWT do Logto via JWKS (cache de chaves)
- [x] `JwtAuthGuard` global — extrai bearer, valida, popula `req.user`
- [x] `UserProvisioningService` — cria `User` local on-first-login a partir do `sub` + claims
- [x] `@Public()` decorator pra rotas que não precisam auth (`/health`, `/.well-known/*`)
- [x] `@CurrentUser()` decorator
- [x] Validações no JWT: assinatura, `iss`, `aud`, `exp`, `sub` presente
- [x] OAuth 2.1 facade (`oauth-facade.controller.ts` + `oauth-facade.service.ts`) para MCP
- [ ] Tests de JWT (válido passa, expirado rejeitado, aud errado rejeitado, provisioning lazy, isolamento)

### FX.7 — Endpoint discovery do MCP 🔴 ⏱️ 1h ✅

- [x] `GET /.well-known/oauth-protected-resource` retornando metadata MCP-compliant apontando pro Logto
- [x] Rota marcada como `@Public()`

### FX.8 — PWA com @logto/next 🔴 ⏱️ 4h ✅

- [x] `pnpm add @logto/next` em `apps/web`
- [x] Route handlers em `app/api/logto/[action]/route.ts` (callback, sign-in, sign-out)
- [x] Tela `/login` com botão "Entrar com Logto"
- [x] Middleware do Next protegendo rotas `(app)/*`
- [x] Cookie de sessão via SDK
- [x] Helper `getApiToken()` pra adicionar `Authorization: Bearer <jwt>` nas chamadas REST

### FX.9 — Configurar Claude e validar fluxo end-to-end 🔴 ⏱️ 2h

- [ ] No Claude (web), adicionar conector apontando pra `https://api.fatia.dominio/mcp`
- [ ] Validar redirect pro Logto, login, retorno pro Claude
- [ ] Testar tool simples (`get_me`) — deve retornar usuário correto
- [ ] Repetir teste no Claude mobile
- [ ] Documentar problemas encontrados e ajustes feitos

### FX.10 — Limpeza final 🟡 ⏱️ 1h

- [ ] Remover comentários temporários deixados durante migração
- [ ] Remover código de auth manual que sobrou
- [ ] Atualizar README local se houver instruções obsoletas
- [ ] `git commit` final tagueado como `post-logto`

**Tempo estimado restante da Fase FX: ~5h** (FX.5 + FX.9 + FX.10 + tests FX.6)

---

## Fase 0 — Setup do projeto

> ✅ **Concluída.**

### F0.1 — Inicialização do monorepo 🔴 ⏱️ 2h ✅

- [x] `pnpm init` na raiz
- [x] Configurar `pnpm-workspace.yaml` com `apps/*` e `packages/*`
- [x] Adicionar Turborepo (`pnpm add -Dw turbo`)
- [x] Criar `turbo.json` com pipelines `dev`, `build`, `typecheck`, `lint`
- [x] `.gitignore` (node_modules, .env, dist, .next, .turbo)
- [x] `.editorconfig`
- [x] `.nvmrc` ou `.tool-versions` com Node 20+
- [x] Commitar estado inicial

### F0.2 — Docker Compose base 🔴 ⏱️ 1h ✅

- [x] `infra/docker-compose.yml` com Postgres 16
- [x] Volume nomeado `fittrack_pg_data`
- [x] Healthcheck no Postgres
- [x] `.env.example` na raiz com variáveis necessárias
- [x] Comando documentado no README

### F0.3 — Pacote `db` (Prisma) 🔴 ⏱️ 3h ✅

- [x] `packages/db/package.json`
- [x] `pnpm add prisma @prisma/client` no pacote
- [x] `prisma init`
- [x] Colar `schema.prisma` final (ver `packages/db/prisma/schema.prisma`)
- [x] Configurar `output` do client para dentro do pacote
- [x] Script `db:migrate`, `db:push`, `db:studio`, `db:seed` no `package.json` raiz
- [x] Primeira migration: `prisma migrate dev --name init`
- [x] Validar com `prisma studio`

### F0.4 — App `api` (NestJS) 🔴 ⏱️ 3h ✅

- [x] `nest new api` em `apps/`
- [x] Configurar para usar pnpm workspace
- [x] Adicionar `@fittrack/db` como dep workspace
- [x] `nestjs-pino` para logs
- [x] Configurar `ConfigModule` com validação de env
- [x] `helmet`, CORS configurado
- [x] `/health` endpoint
- [x] Testar `pnpm --filter api dev` sobe na porta 3000

### F0.5 — App `web` (Next.js) 🔴 ⏱️ 2h ✅

- [x] `npx create-next-app@latest web` em `apps/`
- [x] App Router, TypeScript, Tailwind, src dir
- [x] Adicionar shadcn/ui (`npx shadcn@latest init`)
- [x] Setup tema dark only
- [x] Configurar `next-pwa` (manifest + sw básico)
- [x] Layout root com bottom nav placeholder
- [x] Testar `pnpm --filter web dev` sobe na 3001

### F0.6 — ~~Auth básica~~ ❌ DESCARTADA na Fase FX

> Implementação original com JWT + argon2. Substituída por Logto (ADR 008). Ver Fase FX.6.

### F0.7 — Linting e formatação 🟡 ⏱️ 1h ✅

- [x] ESLint config compartilhada na raiz
- [x] Prettier config
- [x] `lint-staged` + `husky` (opcional, ⏱️ +30min)
- [x] Scripts `lint`, `format`, `typecheck` rodando em todos os pacotes

---

## Fase 1 — Nutrição core

> ✅ **Concluída.**

> **Princípio MCP-first (ver ADR 006):** MCP cobre CRUD completo. PWA cobre o essencial pra v1 (visualização do dia, edição básica). Operações faltantes no PWA podem ser feitas via Claude.

### F1.1 — Seed da TACO 🔴 ⏱️ 4h ✅

- [x] Baixar CSV da Tabela TACO (Unicamp)
- [x] Salvar em `packages/db/prisma/data/taco.csv`
- [x] Implementar parser real em `seed-taco.ts` (substituir o stub)
- [x] Encoding correto (provavelmente latin1)
- [x] Mapear grupos para `FoodGroup`
- [x] Upsert idempotente em `Food` (chave: name + source + createdByUserId=null)
- [x] Validar com 5-10 alimentos comuns
- [x] Documentar no README

### F1.2 — Services de nutrição 🔴 ⏱️ 6h ✅

- [x] `FoodService.search(query, opts, userId)` — TACO + customs do user
- [x] `FoodService.get(id, userId)` — valida acesso
- [x] `FoodService.createCustom(dto, userId)`
- [x] `FoodService.updateCustom(id, dto, userId)` — bloqueia TACO
- [x] `FoodService.deleteCustom(id, userId)`
- [x] `FoodService.listGroups()`
- [x] `MealService.create(dto, userId)` — calcula totais a partir de items
- [x] `MealService.findById(id, userId)`
- [x] `MealService.list(filter, userId)` — com cursor pagination
- [x] `MealService.update(id, dto, userId)`
- [x] `MealService.delete(id, userId)` — cascade items
- [x] `MealItemService.add(mealId, dto, userId)` — recalcula totais
- [x] `MealItemService.update(itemId, dto, userId)` — recalcula totais
- [x] `MealItemService.delete(itemId, userId)` — recalcula totais
- [x] `NutritionSummaryService.getDay(date, userId)` — agregado
- [x] `NutritionSummaryService.getHistory(days, userId)` — médias e per-day
- [x] `UserGoalsService.upsert(dto, userId)` e `.get(userId)` — inclui `dailyStepsTarget` e `weeklyWorkouts`
- [x] Helper `calcMacrosFromFood(food, grams)` testado
- [x] Tests unitários: cálculo de totais, snapshot de foodName, isolamento por user

### F1.3 — Endpoints REST nutrição 🟡 ⏱️ 3h ✅

> REST espelha um subset do MCP — apenas o que o PWA usa. Não todos os métodos.

- [x] `GET /foods/search?q=`
- [x] `POST /custom-foods` `PATCH /custom-foods/:id` `DELETE /custom-foods/:id`
- [x] `GET /food-groups`
- [x] `POST /meals` `GET /meals?date=` `GET /meals/:id` `PATCH /meals/:id` `DELETE /meals/:id`
- [x] `POST /meals/:id/items` `PATCH /meal-items/:id` `DELETE /meal-items/:id`
- [x] `GET /nutrition/summary?date=` `GET /nutrition/history?days=`
- [x] `GET /user-goals` `PUT /user-goals`
- [x] Todos com `JwtAuthGuard` + `@CurrentUser()`

### F1.4 — MCP infraestrutura ✅

- [x] `pnpm add @modelcontextprotocol/sdk` em `apps/api`
- [x] `McpModule` com server HTTP (Streamable HTTP transport)
- [x] Auth via JWT do Logto (guard FX.6)
- [x] Logging estruturado por tool
- [x] Rate limit por `sub`
- [x] Testar localmente com MCP Inspector

### F1.5 — Tools MCP de nutrição 🔴 ⏱️ 8h ✅

- [x] `search_food` `get_food`
- [x] `create_custom_food` `update_custom_food` `delete_custom_food`
- [x] `list_food_groups`
- [x] `log_meal` (a tool central — testada)
- [x] `get_meal` `list_meals` `update_meal` `delete_meal`
- [x] `add_meal_item` `update_meal_item` `delete_meal_item`
- [x] `get_nutrition_summary` `get_nutrition_history`
- [x] `get_nutrition_goals` `set_nutrition_goals`
- [x] Cada tool com descrição clara (visível ao Claude)

### F1.6 — PWA Nutrição 🟡 ⏱️ 12h ✅

- [x] Layout autenticado `(app)/layout.tsx` com bottom nav
- [x] Página `/` (Hoje) — fetch summary do dia
- [x] Componente `<DateNavigator />`
- [x] Componente `<MacroBar />` com cores corretas (range)
- [x] Componente `<MealGroup />` colapsável por tipo
- [x] Componente `<MealItemRow />` com swipe-to-delete
- [x] Modal `<FoodSearch />` para adicionar item
- [x] Modal de edição de item
- [x] Página `/nutrition/goals` com form de ranges (kcal, macros, treinos/sem, **passos/dia**)
- [x] Loading states e empty states
- [x] Testar em viewport mobile

---

## Fase 2 — Treino core

> ⚠️ **Parcialmente implementada.** Services de exercício e sessão prontos. WorkoutPlanService ausente. Controller REST ausente. Apenas 5 das ~19 MCP tools implementadas. PWA é placeholder.

### F2.1 — Seed de exercícios 🔴 ⏱️ 2h ✅

- [x] Lista (já presente no `seed-exercises.ts`) com ~60 exercícios incluindo cardio expandido
- [x] Validar upsert idempotente após mudança de chave composta
- [x] Cobrir: peito, costas, ombro, braço, pernas, core, **cardio (esteira, bike, natação, corrida, caminhada, HIIT, escada, elíptico, remo, corda)**

### F2.2 — Services de treino 🔴 ⏱️ 10h

- [x] `ExerciseService.search(query, muscleGroup?, userId)` — públicos + customs
- [x] `ExerciseService.listByMuscle(group, userId)`
- [x] `ExerciseService.get(id, userId)`
- [x] `ExerciseService.createCustom(dto, userId)`
- [x] `ExerciseService.updateCustom(id, dto, userId)`
- [x] `ExerciseService.deleteCustom(id, userId, force?)` — bloqueia se referenciado
- [ ] `WorkoutPlanService.create(dto, userId)`
- [ ] `WorkoutPlanService.findById(id, userId)` — com exercícios populados
- [ ] `WorkoutPlanService.list(userId)` — com `lastUsedAt`
- [ ] `WorkoutPlanService.update(id, dto, userId)`
- [ ] `WorkoutPlanService.delete(id, userId)` — não cascateia em sessões passadas
- [ ] `WorkoutPlanService.addExercise(planId, dto, userId)`
- [ ] `WorkoutPlanService.updatePlanExercise(peId, dto, userId)`
- [ ] `WorkoutPlanService.removeExercise(peId, userId)`
- [ ] `WorkoutPlanService.reorderExercises(planId, order[], userId)` — transaction
- [x] `WorkoutSessionService.start(planId?, dto, userId)` — retorna prefilled
- [x] `WorkoutSessionService.findById(id, userId)` — com sets + agregados
- [x] `WorkoutSessionService.findActive(userId)`
- [x] `WorkoutSessionService.list(filter, userId)` — paginado
- [x] `WorkoutSessionService.update(id, dto, userId)`
- [x] `WorkoutSessionService.finish(id, dto, userId)` — idempotente
- [x] `WorkoutSessionService.delete(id, userId)`
- [x] `SessionSetService.create(sessionId, dto, userId)` — valida por tipo (força vs cardio)
- [x] `SessionSetService.update(id, dto, userId)` — mesma validação
- [x] `SessionSetService.delete(id, userId)`
- [x] `SessionSetService.getLastForExercise(exerciseId, userId, before?)`
- [x] `SessionSetService.getPersonalRecord(exerciseId, userId, metric)`
- [x] Helper `estimate1RM(weight, reps)` (Epley)
- [x] Helper `calculatePace(durationSeconds, distanceMeters)`
- [x] Helper `isCardioExercise(exercise)`
- [ ] Tests: `getLastForExercise` força e cardio, `getPersonalRecord` ambos, validação por tipo

### F2.3 — Endpoints REST treino 🟡 ⏱️ 4h

> `workout.controller.ts` não existe. Todos os endpoints abaixo precisam ser criados.

- [ ] CRUD `/workout-plans` e `/workout-plans/:id/exercises`
- [ ] `POST /workout-plans/:id/reorder`
- [ ] `POST /workout-sessions` (start), `POST /workout-sessions/:id/finish`
- [ ] `GET /workout-sessions`, `GET /workout-sessions/:id`
- [ ] `PATCH/DELETE /workout-sessions/:id`
- [ ] `POST /workout-sessions/:id/sets` (aceita força ou cardio)
- [ ] `PATCH/DELETE /sets/:id`
- [ ] `GET /exercises/search`, `GET /exercises/by-muscle/:group`
- [ ] CRUD `/custom-exercises`
- [ ] `GET /exercises/:id/last-set`, `GET /exercises/:id/pr`

### F2.4 — Tools MCP de treino 🔴 ⏱️ 7h

- [x] `search_exercise` `list_exercises_by_muscle`
- [x] `create_custom_exercise` `update_custom_exercise` `delete_custom_exercise`
- [ ] `create_workout_plan` `get_workout_plan` `list_workout_plans`
- [ ] `update_workout_plan` `delete_workout_plan`
- [ ] `add_exercise_to_plan` `update_plan_exercise` `remove_exercise_from_plan`
- [ ] `reorder_plan_exercises`
- [ ] `start_workout` (com prefilled — testar bem)
- [ ] `get_workout_session` `list_workout_sessions`
- [ ] `update_workout_session` `finish_workout` `delete_workout_session`
- [ ] **`log_set` com schema Zod discriminado por tipo (força vs cardio)**
- [ ] **`update_set` com mesmo discriminador**
- [ ] `delete_set`
- [ ] `get_last_set_for_exercise` `get_personal_record`
- [ ] Validação Zod robusta em todas

### F2.5 — PWA Treino 🟡 ⏱️ 16h

> `apps/web/src/app/(app)/workout/page.tsx` é um placeholder vazio. Tudo abaixo precisa ser criado.

- [ ] Página `/workout` — plano de hoje (ou seletor)
- [ ] **Componente `<ExerciseCard />` que decide entre força e cardio pelo `muscleGroup`**
- [ ] **Componente `<StrengthSetRow />` editável com inputs Kg, Reps, RPE**
- [ ] **Componente `<CardioEntryRow />` editável com Duração (mm:ss), Distância (km), FC, Kcal**
- [ ] Coluna "Previous" puxa via `lastSet` do `start_workout` — formato adapta por tipo
- [ ] Botão "Add Set" / "Add Entry" conforme tipo
- [ ] Header sticky com progresso "X/Y exercises" e botão "Finish"
- [ ] Modal de confirmação ao Finish (mostra resumo: volume força + tempo cardio)
- [ ] Página `/workout/plans` (CRUD)
- [ ] Página `/workout/plans/:id/edit` com drag-to-reorder e suporte a cardio
- [ ] Página `/workout/history` (lista por semana)
- [ ] Página de detalhe de sessão passada (read-only) — exibe ambos os tipos

---

## Fase 3 — Progresso e atividade

> ⚠️ **Quase concluída.** F3.1–F3.4 e F3.6 estão prontos. Em F3.5, as tabs Peso e Passos funcionam; Força e Cardio são placeholders.

### F3.1 — Services de progresso 🔴 ⏱️ 8h ✅

- [x] `WeightLogService.create(dto, userId)`
- [x] `WeightLogService.update(id, dto, userId)`
- [x] `WeightLogService.delete(id, userId)`
- [x] `WeightLogService.list(filter, userId)` — paginado
- [x] `StepLogService.create(dto, userId)` — múltiplos por dia OK
- [x] `StepLogService.update(id, dto, userId)`
- [x] `StepLogService.delete(id, userId)`
- [x] `StepLogService.list(filter, userId)` — paginado
- [x] **`StepLogService.getStepsForDate(date, userId)`** — política: maior valor entre os logs do dia (ver ADR 007)
- [x] **`StepLogService.getHistory(days, userId)`** — preenche dias sem log com 0
- [x] `ProgressService.weightProgress(days, userId)`
- [x] `ProgressService.strengthProgress(exerciseId, days, metric, userId)`
- [x] `ProgressService.cardioProgress(exerciseId, days, metric, userId)`
- [x] `ProgressService.volumeProgress(days, muscleGroup?, userId)`
- [x] `ProgressService.stepsProgress(days, userId)`
- [x] Helper de "início de semana" no fuso do user
- [x] Helper "data no fuso do user"
- [x] Tests: helpers de fuso (date-tz.spec)

### F3.2 — Endpoints REST progresso 🟡 ⏱️ 3h ✅

- [x] CRUD `/weight-logs`
- [x] CRUD `/step-logs`
- [x] `GET /step-logs/by-date/:date`
- [x] `GET /progress/weight?days=`
- [x] `GET /progress/strength?exerciseId=&days=&metric=`
- [x] `GET /progress/cardio?exerciseId=&days=&metric=`
- [x] `GET /progress/volume?days=&muscleGroup=`
- [x] `GET /progress/steps?days=`

### F3.3 — Tools MCP de progresso 🟡 ⏱️ 5h ✅

- [x] `log_weight` `update_weight_log` `delete_weight_log` `list_weight_logs`
- [x] `log_steps` `update_step_log` `delete_step_log` `list_step_logs`
- [x] `get_steps_for_date` `get_steps_history`
- [x] `get_weight_progress`
- [x] `get_strength_progress`
- [x] `get_cardio_progress`
- [x] `get_volume_progress`
- [x] `get_steps_progress`

### F3.4 — Services e tools de Dashboard 🟡 ⏱️ 5h ✅

- [x] `DashboardService.today(userId)` — combina nutrition + workout + weight + steps + streak
- [x] `DashboardService.week(userId)` — agregado semanal
- [x] Endpoint REST `GET /dashboard/today` `GET /dashboard/week`
- [x] Tool MCP `get_today_summary`
- [x] Tool MCP `get_week_summary`

### F3.5 — PWA Progresso 🟡 ⏱️ 12h ✅

- [x] Página `/progress` com tabs **Peso | Força | Cardio | Passos**
- [x] Filtros 14/30/90/180 dias
- [x] `<WeightChart />` com Recharts (área + linha)
- [x] `<StrengthChart />` com seletor de exercício e métrica (max_weight, 1RM, volume)
- [x] `<CardioChart />` com seletor de cardio e métrica (duração, distância, pace, kcal)
- [x] `<StepsChart />` gráfico de barras com linha de meta
- [x] Modal "Logar peso"
- [x] Modal "Logar passos"
- [x] Tabela de médias semanais
- [x] `<PersonalRecords />` deriva PRs reais dos exercícios mais usados
- [x] `<TrainingIntensity />` heatmap de 14 dias agregado por sessão
- [x] `<ConsistencyCard />` dias-com-treino na janela de 30 dias
- [ ] Lista editável de pesos logados (correção) — via Claude por enquanto
- [ ] Lista editável de logs de passos (correção) — via Claude por enquanto

### F3.6 — Card de passos no Dashboard 🟡 ⏱️ 3h ✅

- [x] `<StepsCard />` — passos atuais + meta + barra
- [x] Integração no dashboard chamando `get_today_summary`
- [x] Botão de log rápido inline

---

## Fase G — Metas pessoais dinâmicas

> ✅ **Concluída.** Metas definíveis pelo usuário (PWA ou MCP). Distintas das metas de nutrição (`UserGoals` 1:1).

### G.1 — Schema 🔴 ⏱️ 30min ✅

- [x] Model `Goal` (`id`, `userId`, `kind`, `title`, `description`, `startValue`, `targetValue`, `unit`, `lastReportedValue`, `deadline`, `status`, `createdAt`, `completedAt`)
- [x] Enums `GoalKind` (weight, body_fat, workout_frequency, step_count, custom) e `GoalStatus` (active, completed, expired, archived)
- [x] Campo `User.heightCm` opcional
- [x] Migration `add_goals_and_user_height`

### G.2 — `GoalsService` 🔴 ⏱️ 3h ✅

- [x] `create` — deriva `startValue` quando kind tem fonte automática
- [x] `findById` / `list` — retornam `currentValue` + `progressPercent` calculados
- [x] `update` — campos editáveis + transição de status
- [x] `complete` — atalho para `status=completed` + `completedAt`
- [x] `delete`
- [x] `deriveCurrentValue` — weight (último log), workout_frequency (sessions 7d), step_count (média 7d), body_fat/custom (lastReportedValue)
- [x] `computeProgress` helper (handle metas crescentes ou decrescentes)

### G.3 — REST controller 🟡 ⏱️ 1h ✅

- [x] CRUD `/api/goals`
- [x] `POST /api/goals/:id/complete`
- [x] DTOs com `class-validator`

### G.4 — MCP tools 🔴 ⏱️ 2h ✅

- [x] `create_goal`, `list_goals`, `get_goal`
- [x] `update_goal` (com `lastReportedValue` para body_fat/custom)
- [x] `complete_goal`, `delete_goal`

### G.5 — PWA `/goals` 🟡 ⏱️ 4h ✅

- [x] `goalsApi` client
- [x] Página consome metas reais; primeira ativa vira meta principal com círculo de progresso
- [x] Cards secundários com bar de progresso, concluir/remover inline
- [x] Lista "Metas Recentes" (concluídas + expiradas)
- [x] `<NewGoalDrawer />` com 5 tipos e validação

### G.6 — Estatura no User + drawer 🟡 ⏱️ 2h ✅

- [x] `User.heightCm` no schema (migration G.1)
- [x] `PATCH /api/users/me` aceita `heightCm`
- [x] `update_me` MCP tool
- [x] `usersApi.me/updateMe` client
- [x] `<EditHeightDrawer />` no `/profile`

### G.7 — Limpeza dos mocks no PWA 🟡 ⏱️ 2h ✅

- [x] Remove `personalRecords` hardcoded em `/progress`
- [x] Remove `buildHeatmap`, `buildWeightSeries` fallbacks
- [x] Remove cards "Massa Magra +0.8%" e placeholder texto força/cardio
- [x] `/profile`: peso atual vem de `dashboard.today`; remove avatar edit, badge plano, suporte, v1.0.4
- [x] Renomeia "Configurações" → "Metas de nutrição"

---

## Fase H — Hidratação

> ✅ **Concluída.** Log de consumo de água com meta diária, MCP-first.
> Política SUM por dia (cada copo é um evento independente).

### H.1 — Schema 🔴 ⏱️ 30min ✅

- [x] Model `WaterLog` (`id`, `userId`, `date`, `ml`, `loggedAt`, `notes`)
- [x] Índices `(userId, date)` e `(userId, loggedAt)`
- [x] Campo `UserGoals.dailyWaterTargetMl` (default 2500)
- [x] Migration `add_water_logs`

### H.2 — `WaterLogService` 🔴 ⏱️ 1h ✅

- [x] `create`, `update`, `delete`, `findById`, `list`
- [x] `getForDate(date, userId)` → **SOMA** dos logs do dia
- [x] `getHistory(days, userId, tz)` → série diária com 0 nos vazios

### H.3 — REST controller 🟡 ⏱️ 30min ✅

- [x] CRUD `/api/water-logs`
- [x] `GET /api/water-logs/by-date/:date`
- [x] `GET /api/progress/water?days=N`
- [x] `ProgressService.waterProgress()` com stats + meta
- [x] `DashboardService.today()` retorna bloco `water`
- [x] `set_nutrition_goals` aceita `dailyWaterTargetMl`

### H.4 — MCP tools 🔴 ⏱️ 2h ✅

- [x] `log_water` (retorna totalMl + goalReached)
- [x] `update_water_log`, `delete_water_log`
- [x] `list_water_logs`
- [x] `get_water_for_date`, `get_water_history`, `get_water_progress`

### H.5 — PWA 🟡 ⏱️ 2h ✅

- [x] `progressApi` com waterApi (CRUD + waterForDate + water progress)
- [x] `<WaterCard />` no dashboard com quick-add inline (250/500/750 mL)
- [x] `<LogWaterDrawer />` com presets + custom mL
- [x] `TodaySummary.water` no client

---

## Fase 4 — Polimento

### F4.1 — PWA installable 🟡 ⏱️ 3h

- [x] Manifest completo com ícones
- [x] Service worker com cache de assets estáticos
- [x] Ícone SVG mascável
- [ ] Testar instalação no iOS e Android (manual)

### F4.2 — Onboarding do Claude no PWA 🔴 ⏱️ 3h ✅

- [x] Página `/profile` mostra dados do usuário (nome, email — read-only)
- [x] Seção "Conectar ao Claude" com URL do MCP server e instruções passo-a-passo
- [x] Link "Gerenciar sessões ativas" → abre console do Logto
- [x] Botão "Sair" → encerra sessão local + Logto via SDK

### F4.3 — Dashboard 🟢 ⏱️ 4h ✅

- [x] Página `/dashboard` com saudação por horário
- [x] Checklist do dia (peso, refeições, treino) — via `get_today_summary`
- [x] Atalhos para ações rápidas

### F4.4 — Logout e segurança 🟡 ⏱️ 2h ✅

- [x] Logout funcional via @logto/next signOut
- [x] Re-login automático ao receber 401
- [x] Mensagens de erro de auth claras

### F4.5 — Backup automático 🟡 ⏱️ 2h ✅

- [x] Script `pg_dumpall` no host (cobre `fatia` e `logto`)
- [x] Documentação para cron diário 4am
- [x] Retenção configurável via `RETENTION_DAYS` (default 7 dias)
- [x] Restauração documentada em infra/README

---

## Tarefas transversais (em paralelo)

### T.1 — Documentação contínua 🟡

- [ ] Atualizar ADRs quando decisão arquitetural mudar
- [ ] README sempre alinhado com comandos atuais
- [ ] Comentários em endpoints MCP (descrição visível para Claude)

### T.2 — Testes mínimos 🟡

- [x] Tests unitários: cálculo de totais nutricionais
- [ ] Tests unitários: `getLastWeight`
- [ ] Tests integration: guards de auth (JWT válido/expirado/aud errado, isolamento por user)
- [ ] Tests integration: isolamento user A não vê dados de user B

### T.3 — Setup do servidor de produção 🟡 (~Fase 4)

- [ ] Caddy ou nginx na frente
- [ ] Subdomínios `api.` e `app.`
- [ ] SSL automático
- [ ] Variáveis de ambiente de produção (secrets gerenciados)
- [ ] Deploy inicial e smoke test
- [ ] Configurar Logto tenant em produção (mirrors FX.5)

---

## Planejamento de Conclusão

> Ordem sugerida para fechar o backlog restante. Estimativas baseadas no que já existe no projeto.

### Prioridade 1 — Desbloquear treino (F2) ⏱️ ~18h

**Objetivo:** Claude consegue criar plano de treino, iniciar sessão e logar séries.

1. **`WorkoutPlanService`** (F2.2 restante) — ⏱️ 4h
   - Criar `apps/api/src/workout/workout-plan.service.ts`
   - Métodos: `create`, `findById`, `list`, `update`, `delete`, `addExercise`, `updatePlanExercise`, `removeExercise`, `reorderExercises` (transaction)
   - Registrar no `WorkoutModule`

2. **MCP tools de treino restantes** (F2.4) — ⏱️ 7h
   - Plan CRUD: `create_workout_plan`, `get_workout_plan`, `list_workout_plans`, `update_workout_plan`, `delete_workout_plan`
   - Plan exercises: `add_exercise_to_plan`, `update_plan_exercise`, `remove_exercise_from_plan`, `reorder_plan_exercises`
   - Session CRUD: `start_workout`, `get_workout_session`, `list_workout_sessions`, `update_workout_session`, `finish_workout`, `delete_workout_session`
   - Sets: `log_set` (Zod discriminado força/cardio), `update_set`, `delete_set`, `get_last_set_for_exercise`, `get_personal_record`

3. **Controller REST treino** (F2.3) — ⏱️ 3h
   - Criar `apps/api/src/workout/workout.controller.ts`
   - Todos os endpoints listados em F2.3
   - Registrar no `WorkoutModule`

4. **Tests F2.2** — ⏱️ 2h (pode fazer junto com o item 1)
   - `getLastForExercise` força e cardio
   - `getPersonalRecord` ambos
   - Validação por tipo (força rejeita cardio fields e vice-versa)

5. **PWA Treino** (F2.5) — ⏱️ 16h (separar em sub-etapas)
   - Etapa 5a (4h): Página `/workout` com sessão ativa básica (sem histórico, sem plans)
   - Etapa 5b (4h): `<ExerciseCard />`, `<StrengthSetRow />`, `<CardioEntryRow />`
   - Etapa 5c (4h): Página `/workout/plans` + `/workout/plans/:id/edit`
   - Etapa 5d (4h): `/workout/history` + detalhe de sessão

### Prioridade 2 — ~~Fechar gráficos de progresso (F3.5)~~ ✅ CONCLUÍDA

StrengthChart e CardioChart implementados com seletor de exercício + métricas. PRs, heatmap e constância derivam de `listSessions` real.

### Prioridade 3 — Configurar Logto e validar end-to-end (FX.5 + FX.9) ⏱️ ~4h

**Objetivo:** Login funcional em produção; Claude conectado via OAuth 2.1.

1. **FX.5** — Configurar tenant no console do Logto (app, API resource, DCR, roles, usuário de teste)
2. **FX.9** — Adicionar conector no Claude, testar `get_me`, testar no mobile
3. **FX.10** — Limpeza final, tag `post-logto`

### Prioridade 4 — Testes e produção (T.2 + T.3) ⏱️ ~6h

1. **T.2** — Tests de guards de auth e isolamento (2h)
2. **T.3** — Setup de servidor, subdomínios, SSL, deploy (4h)

---

### Resumo do backlog restante

| Item                            | Estimativa | Prioridade |
| ------------------------------- | ---------- | ---------- |
| WorkoutPlanService              | 4h         | 1          |
| MCP tools treino (14 faltando)  | 7h         | 1          |
| Controller REST treino          | 3h         | 1          |
| Tests F2.2                      | 2h         | 1          |
| PWA Treino (F2.5)               | 16h        | 1          |
| ~~StrengthChart + CardioChart~~ | ✅         | —          |
| ~~Fase G — Metas pessoais~~     | ✅         | —          |
| FX.5 Logto tenant + FX.9 Claude | 4h         | 3          |
| Tests guards + isolamento       | 2h         | 4          |
| Setup produção                  | 4h         | 4          |
| **Total**                       | **~42h**   |            |

---

## Definition of Done por fase

**Fase 1:** ✅ Via Claude no celular, registrar refeição, ver total do dia no PWA. ~18 tools MCP funcionais.

**Fase 2:** Executar treino completo no PWA com "previous" de cada exercício. Treinos híbridos (força + cardio) funcionam. ~19 tools MCP de treino via Claude.

**Fase 3:** Gráficos de peso, força, cardio e passos nos últimos 30 dias com dados reais. Tools MCP de progresso e dashboard retornam dados consistentes.

**Fase 4:** App instalável, multi-usuário em produção. Onboarding via Logto em < 5 minutos.

## Resumo: cobertura de tools MCP por fase

| Fase                                | Tools MCP entregues                                          | Acumulado |
| ----------------------------------- | ------------------------------------------------------------ | --------- |
| F1 (Nutrição)                       | 16 tools (perfil, metas, food, meal, item, summary)          | 16        |
| F2 (Treino)                         | 5 implementadas / 19 previstas (exercise search/CRUD custom) | 21 atual  |
| F3 (Progresso + Passos + Dashboard) | 17 tools (weight 4 + steps 6 + progress 5 + dashboard 2)     | +17       |
| FG (Metas pessoais)                 | 6 tools (create/list/get/update/complete/delete_goal)        | +6        |
| FH (Hidratação)                     | 7 tools (log/update/delete/list/for_date/history/progress)   | +7        |
| Meta (update_me)                    | 1 tool                                                       | +1        |
| **Total atual**                     | **52 tools funcionais**                                      | **52**    |
| **Faltando (F2)**                   | 14 tools (plan, session, set, PR)                            | → **66**  |

Total esperado ao fim da v1: **~66 tools MCP**. Auth via Logto OAuth 2.1.

# Tasks

Checklist completo de implementação. Marca conforme avança. Tarefas filhas (`-`) indicam subtarefas práticas; pais com `[ ]` representam o entregável da fase.

**Legenda:**
- 🔴 Bloqueante — outras tasks dependem desta
- 🟡 Importante — fazer logo, mas não bloqueia
- 🟢 Nice-to-have — pode esperar
- ⏱️ Estimativa em horas (h)

> **Status atual:** Fases 0, 1 e 2 foram implementadas com auth manual (JWT + bearer MCP). Após descobrir que conectores remotos no Claude exigem OAuth 2.1, decidimos migrar pra Logto (ver ADR 008). A **Fase FX** abaixo lista o que precisa ser descartado/adaptado do que já foi feito.

---

## Fase FX — Migração para Logto (ADR 008)

> Executar **antes** de prosseguir com Fase 3. Drop-and-recreate é OK porque só há dados de teste do dev.

### FX.1 — Backup do estado atual 🟡 ⏱️ 30min
- [ ] `git commit` do estado atual (mesmo que já esteja sujo) com tag `pre-logto`
- [ ] Documentar no commit message qual versão da auth manual estava implementada (referência pra arqueologia futura)

### FX.2 — Descartar implementação atual de auth 🔴 ⏱️ 2h
- [ ] Remover módulo `AuthModule` antigo da API (signup, login, JWT signing, argon2)
- [ ] Remover endpoints `/auth/login`, `/auth/signup`, `/auth/logout`
- [ ] Remover `JwtAuthGuard` antigo (vai ser reescrito)
- [ ] Remover `McpAuthGuard` (substituído por novo guard que valida JWT do Logto)
- [ ] Remover endpoints `/mcp-tokens` (CRUD de tokens MCP)
- [ ] Remover do PWA: form de login, página de signup (se tiver), página de gerenciamento de tokens MCP
- [ ] Remover deps não usadas: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`
- [ ] **Não** removeu o `JwtAuthGuard` enquanto não tem o novo — comentar usos temporariamente

### FX.3 — Schema migration 🔴 ⏱️ 1h
- [ ] `User.passwordHash` removido do schema (já feito no schema de referência)
- [ ] Model `McpToken` removido (já feito)
- [ ] `User.logtoSub` adicionado (já feito)
- [ ] Drop database e recreate: `pnpm db:push --force-reset` (OK em dev)
- [ ] OU: criar migration explícita `prisma migrate dev --name logto-migration`
- [ ] Rodar `pnpm db:seed` — admin não é mais criado, apenas exercícios e TACO

### FX.4 — Subir Logto 🔴 ⏱️ 3h
- [ ] Conferir `infra/docker-compose.yml` com serviço `logto` e `postgres-init/`
- [ ] Conferir `.env.example` com variáveis de Logto
- [ ] Configurar Dokploy: subdomínio `auth.fatia.dominio` apontando pra porta 3002 do container Logto
- [ ] Subir: `docker compose up -d postgres logto`
- [ ] Esperar primeira inicialização (~30s) — Logto roda migrations próprias na database `logto`
- [ ] Acessar console em `auth.fatia.dominio/console` (porta 3003 em dev)
- [ ] Criar conta de admin do **Logto** (diferente do admin do app — é quem administra o IDP)

### FX.5 — Configurar tenant no Logto 🔴 ⏱️ 2h
- [ ] No console do Logto:
  - [ ] Criar **Application** "Fatia PWA" tipo `Traditional Web` (Next.js)
    - Redirect URI: `https://app.fatia.dominio/api/logto/callback`
    - Post-logout URI: `https://app.fatia.dominio/`
    - Anotar `App ID` e `App Secret` → preencher `LOGTO_APP_ID` e `LOGTO_APP_SECRET`
  - [ ] Criar **API Resource** "Fatia API"
    - Identifier: `https://api.fatia.dominio` → preencher `LOGTO_AUDIENCE`
    - Definir scopes básicos: `read`, `write` (começar simples)
  - [ ] Habilitar **Dynamic Client Registration** nas configurações do tenant (necessário pra MCP)
  - [ ] Criar **Roles** `user` (default) e `admin`
  - [ ] Criar usuário de teste no console (você mesmo) com role `user` ou `admin`
- [ ] Tema dark da tela de login (opcional na FX, pode adiar)

### FX.6 — Reimplementar auth na API como resource server 🔴 ⏱️ 6h
- [ ] `pnpm add jose` em `apps/api`
- [ ] Remover deps antigas (ver FX.2)
- [ ] Criar `AuthModule` novo com:
  - [ ] `JwtValidationService` — valida JWT do Logto via JWKS (cache de chaves)
  - [ ] `JwtAuthGuard` global — extrai bearer, valida, popula `req.user`
  - [ ] `UserProvisioningService` — cria `User` local on-first-login a partir do `sub` + claims
  - [ ] `@Public()` decorator pra rotas que não precisam auth (`/health`, `/.well-known/*`)
  - [ ] `@CurrentUser()` decorator (mantém igual, mas agora retorna user provisioned)
- [ ] Validações no JWT: assinatura, `iss`, `aud`, `exp`, `sub` presente
- [ ] Mapeamento de role: claim `roles` do Logto → `User.role` local na primeira vez
- [ ] Tests:
  - [ ] JWT válido passa
  - [ ] JWT expirado é rejeitado
  - [ ] JWT com `aud` errado é rejeitado
  - [ ] Provisioning lazy cria User na primeira request
  - [ ] User existente é reusado nas próximas requests
  - [ ] Usuário A não acessa dados do usuário B (continua valendo)

### FX.7 — Endpoint discovery do MCP 🔴 ⏱️ 1h
- [ ] `GET /.well-known/oauth-protected-resource` retornando metadata MCP-compliant apontando pro Logto
- [ ] Marcar essa rota como `@Public()`
- [ ] Testar com `curl` — payload deve seguir spec MCP

### FX.8 — PWA com @logto/next 🔴 ⏱️ 4h
- [ ] `pnpm add @logto/next` em `apps/web`
- [ ] Configurar Logto provider no `app/layout.tsx` (server component)
- [ ] Route handlers em `app/api/logto/[action]/route.ts` (callback, sign-in, sign-out)
- [ ] Substituir tela `/login` por botão "Entrar com Logto"
- [ ] Middleware do Next protegendo rotas `(app)/*`
- [ ] Cookie de sessão httpOnly via SDK
- [ ] Helper `getApiToken()` no server pra adicionar `Authorization: Bearer <jwt>` nas chamadas REST à API
- [ ] Tela `/profile` reescrita: mostra dados do user, instruções pra Claude, link pro Logto, logout

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

**Tempo estimado total da Fase FX: ~22-25h** (3-4 dias focados)

---

## Fase 0 — Setup do projeto

> ✅ **Concluída.** Auth manual implementada (será substituída na Fase FX).

### F0.1 — Inicialização do monorepo 🔴 ⏱️ 2h ✅
- [x] `pnpm init` na raiz
- [x] Configurar `pnpm-workspace.yaml` com `apps/*` e `packages/*`
- [x] Adicionar Turborepo (`pnpm add -Dw turbo`)
- [x] Criar `turbo.json` com pipelines `dev`, `build`, `typecheck`, `lint`
- [x] `.gitignore` (node_modules, .env, dist, .next, .turbo)
- [x] `.editorconfig`
- [x] `.nvmrc` ou `.tool-versions` com Node 20+
- [x] Commitar estado inicial

### F0.2 — Docker Compose base 🔴 ⏱️ 1h
- [x] `infra/docker-compose.yml` com Postgres 16
- [x] Volume nomeado `fittrack_pg_data`
- [x] Healthcheck no Postgres
- [x] `.env.example` na raiz com variáveis necessárias
- [x] Comando documentado no README

### F0.3 — Pacote `db` (Prisma) 🔴 ⏱️ 3h
- [x] `packages/db/package.json`
- [x] `pnpm add prisma @prisma/client` no pacote
- [x] `prisma init`
- [x] Colar `schema.prisma` final (ver `packages/db/prisma/schema.prisma`)
- [x] Configurar `output` do client para dentro do pacote
- [x] Script `db:migrate`, `db:push`, `db:studio`, `db:seed` no `package.json` raiz
- [x] Primeira migration: `prisma migrate dev --name init`
- [x] Validar com `prisma studio`

### F0.4 — App `api` (NestJS) 🔴 ⏱️ 3h
- [x] `nest new api` em `apps/`
- [x] Configurar para usar pnpm workspace
- [x] Adicionar `@fittrack/db` como dep workspace
- [x] `nestjs-pino` para logs
- [x] Configurar `ConfigModule` com validação de env
- [x] `helmet`, CORS configurado
- [x] `/health` endpoint
- [x] Testar `pnpm --filter api dev` sobe na porta 3000

### F0.5 — App `web` (Next.js) 🔴 ⏱️ 2h
- [x] `npx create-next-app@latest web` em `apps/`
- [x] App Router, TypeScript, Tailwind, src dir
- [x] Adicionar shadcn/ui (`npx shadcn@latest init`)
- [x] Setup tema dark only
- [x] Configurar `next-pwa` (manifest + sw básico)
- [x] Layout root com bottom nav placeholder
- [x] Testar `pnpm --filter web dev` sobe na 3001

### F0.6 — ~~Auth básica~~ ❌ DESCARTADA na Fase FX
> Implementação original com JWT + argon2. Substituída por Logto (ADR 008). Ver Fase FX.6.

### F0.7 — Linting e formatação 🟡 ⏱️ 1h
- [x] ESLint config compartilhada na raiz
- [x] Prettier config
- [x] `lint-staged` + `husky` (opcional, ⏱️ +30min)
- [x] Scripts `lint`, `format`, `typecheck` rodando em todos os pacotes

---

## Fase 1 — Nutrição core

> ✅ **Concluída.** A tool MCP infra (F1.4) usou `McpToken` que será removida na Fase FX. Tools de nutrição em si permanecem válidas — só o guard de auth muda.

> **Princípio MCP-first (ver ADR 006):** MCP cobre CRUD completo. PWA cobre o essencial pra v1 (visualização do dia, edição básica). Operações faltantes no PWA podem ser feitas via Claude.

### F1.1 — Seed da TACO 🔴 ⏱️ 4h
- [x] Baixar CSV da Tabela TACO (Unicamp)
- [x] Salvar em `packages/db/prisma/data/taco.csv`
- [x] Implementar parser real em `seed-taco.ts` (substituir o stub)
- [x] Encoding correto (provavelmente latin1)
- [x] Mapear grupos para `FoodGroup`
- [x] Upsert idempotente em `Food` (chave: name + source + createdByUserId=null)
- [x] Validar com 5-10 alimentos comuns
- [x] Documentar no README

### F1.2 — Services de nutrição 🔴 ⏱️ 6h
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

### F1.3 — Endpoints REST nutrição 🟡 ⏱️ 3h
> REST espelha um subset do MCP — apenas o que o PWA usa. Não todos os métodos.
- [x] `GET /foods/search?q=`
- [x] `POST /custom-foods` `PATCH /custom-foods/:id` `DELETE /custom-foods/:id`
- [x] `GET /food-groups`
- [x] `POST /meals` `GET /meals?date=` `GET /meals/:id` `PATCH /meals/:id` `DELETE /meals/:id`
- [x] `POST /meals/:id/items` `PATCH /meal-items/:id` `DELETE /meal-items/:id`
- [x] `GET /nutrition/summary?date=` `GET /nutrition/history?days=`
- [x] `GET /user-goals` `PUT /user-goals`
- [x] Todos com `JwtAuthGuard` + `@CurrentUser()`

### F1.4 — MCP infraestrutura ⚠️ PARCIALMENTE DESCARTADA
> Implementação original incluía CRUD de `McpToken` e `McpAuthGuard` próprio. Essas partes serão removidas na Fase FX. As tools em si (search_food, log_meal, etc) permanecem — só o guard de auth muda na Fase FX.6.
- [x] `pnpm add @modelcontextprotocol/sdk` em `apps/api`
- [x] `McpModule` com server HTTP (Streamable HTTP transport)
- [x] ~~`McpAuthGuard` valida bearer~~ → será substituído na FX
- [x] ~~Endpoints `/mcp-tokens`~~ → serão removidos na FX
- [x] Tools de nutrição (search_food, log_meal, etc) — permanecem
- [x] Logging estruturado por tool
- [x] Rate limit por token — será adaptado pra rate limit por `sub` na FX
- [x] Testar localmente com MCP Inspector

### F1.5 — Tools MCP de nutrição 🔴 ⏱️ 8h ✅
> Cada tool é um wrapper fino sobre o Service correspondente. Validação Zod no input.
- [x] `search_food` `get_food`
- [x] `create_custom_food` `update_custom_food` `delete_custom_food`
- [x] `list_food_groups`
- [x] `log_meal` (a tool central — testar bem)
- [x] `get_meal` `list_meals` `update_meal` `delete_meal`
- [x] `add_meal_item` `update_meal_item` `delete_meal_item`
- [x] `get_nutrition_summary` `get_nutrition_history`
- [x] `get_nutrition_goals` `set_nutrition_goals`
- [x] Cada tool com descrição clara (visível ao Claude)
- [x] Testar fluxos completos de `docs/MCP.md` no MCP Inspector

### F1.6 — PWA Nutrição 🟡 ⏱️ 12h
- [x] Layout autenticado `(app)/layout.tsx` com bottom nav
- [x] Página `/` (Hoje) — fetch summary do dia
- [x] Componente `<DateNavigator />`
- [x] Componente `<MacroBar />` com cores corretas (range)
- [x] Componente `<MealGroup />` colapsável por tipo
- [x] Componente `<MealItemRow />` com swipe-to-delete
- [x] Modal `<FoodSearch />` para adicionar item (chama `search_food` + `add_meal_item`)
- [x] Modal de edição de item
- [x] Página `/nutrition/goals` com form de ranges (kcal, macros, treinos/sem, **passos/dia**)
- [x] Loading states e empty states
- [x] Testar em viewport mobile

---

## Fase 2 — Treino core

> ✅ **Concluída.**

### F2.1 — Seed de exercícios 🔴 ⏱️ 2h
- [x] Lista (já presente no `seed-exercises.ts`) com ~60 exercícios incluindo cardio expandido
- [x] Validar upsert idempotente após mudança de chave composta
- [x] Cobrir: peito, costas, ombro, braço, pernas, core, **cardio (esteira, bike, natação, corrida, caminhada, HIIT, escada, elíptico, remo, corda)**

### F2.2 — Services de treino 🔴 ⏱️ 10h
- [x] `ExerciseService.search(query, muscleGroup?, userId)` — públicos + customs
- [x] `ExerciseService.listByMuscle(group, userId)`
- [x] `ExerciseService.createCustom(dto, userId)`
- [x] `ExerciseService.updateCustom(id, dto, userId)`
- [x] `ExerciseService.deleteCustom(id, userId, force?)` — bloqueia se referenciado
- [x] `WorkoutPlanService.create(dto, userId)`
- [x] `WorkoutPlanService.findById(id, userId)` — com exercícios populados
- [x] `WorkoutPlanService.list(userId)` — com `lastUsedAt`
- [x] `WorkoutPlanService.update(id, dto, userId)`
- [x] `WorkoutPlanService.delete(id, userId)` — não cascateia em sessões passadas
- [x] `WorkoutPlanService.addExercise(planId, dto, userId)`
- [x] `WorkoutPlanService.updatePlanExercise(peId, dto, userId)`
- [x] `WorkoutPlanService.removeExercise(peId, userId)`
- [x] `WorkoutPlanService.reorderExercises(planId, order[], userId)` — transaction
- [x] `WorkoutSessionService.start(planId?, dto, userId)` — retorna prefilled
- [x] `WorkoutSessionService.findById(id, userId)` — com sets + agregados (volume força + duração cardio)
- [x] `WorkoutSessionService.list(filter, userId)` — paginado
- [x] `WorkoutSessionService.update(id, dto, userId)`
- [x] `WorkoutSessionService.finish(id, dto, userId)` — idempotente
- [x] `WorkoutSessionService.delete(id, userId)`
- [x] **`SessionSetService.create(sessionId, dto, userId)` — valida conforme tipo do exercício:**
  - Força: exige `weightKg + reps`, rejeita campos de cardio
  - Cardio: exige `durationSeconds`, rejeita campos de força
  - Auto setNumber, detecta PR
- [x] `SessionSetService.update(id, dto, userId)` — mesma validação
- [x] `SessionSetService.delete(id, userId)`
- [x] `SessionSetService.getLastForExercise(exerciseId, userId, before?)` — retorna campos relevantes
- [x] `SessionSetService.getPersonalRecord(exerciseId, userId, metric)` — métrica varia por tipo
- [x] Helper `estimate1RM(weight, reps)` (Epley) testado
- [x] Helper `calculatePace(durationSeconds, distanceMeters)` testado
- [x] Helper `isCardioExercise(exercise)` — `muscleGroup === 'cardio'`
- [x] Tests: `getLastForExercise` força e cardio, `getPersonalRecord` ambos, validação por tipo, treino híbrido

### F2.3 — Endpoints REST treino 🟡 ⏱️ 4h
- [x] CRUD `/workout-plans` e `/workout-plans/:id/exercises`
- [x] `POST /workout-plans/:id/reorder`
- [x] `POST /workout-sessions` (start), `POST /workout-sessions/:id/finish`
- [x] `GET /workout-sessions`, `GET /workout-sessions/:id`
- [x] `PATCH/DELETE /workout-sessions/:id`
- [x] `POST /workout-sessions/:id/sets` (aceita força ou cardio)
- [x] `PATCH/DELETE /sets/:id`
- [x] `GET /exercises/search`, `GET /exercises/by-muscle/:group`
- [x] CRUD `/custom-exercises`
- [x] `GET /exercises/:id/last-set`, `GET /exercises/:id/pr`

### F2.4 — Tools MCP de treino 🔴 ⏱️ 7h
- [x] `search_exercise` `list_exercises_by_muscle`
- [x] `create_custom_exercise` `update_custom_exercise` `delete_custom_exercise`
- [x] `create_workout_plan` `get_workout_plan` `list_workout_plans`
- [x] `update_workout_plan` `delete_workout_plan`
- [x] `add_exercise_to_plan` `update_plan_exercise` `remove_exercise_from_plan`
- [x] `reorder_plan_exercises`
- [x] `start_workout` (com prefilled — testar bem)
- [x] `get_workout_session` `list_workout_sessions`
- [x] `update_workout_session` `finish_workout` `delete_workout_session`
- [x] **`log_set` com schema Zod discriminado por tipo (força vs cardio)**
- [x] **`update_set` com mesmo discriminador**
- [x] `delete_set`
- [x] `get_last_set_for_exercise` `get_personal_record`
- [x] Validação Zod robusta em todas

### F2.5 — PWA Treino 🟡 ⏱️ 16h
- [x] Página `/workout` — plano de hoje (ou seletor)
- [x] **Componente `<ExerciseCard />` que decide entre força e cardio pelo `muscleGroup`**
- [x] **Componente `<StrengthSetRow />` editável com inputs Kg, Reps, RPE**
- [x] **Componente `<CardioEntryRow />` editável com Duração (mm:ss), Distância (km), FC, Kcal**
- [x] Coluna "Previous" puxa via `lastSet` do `start_workout` — formato adapta por tipo
- [x] Botão "Add Set" / "Add Entry" conforme tipo
- [x] Header sticky com progresso "X/Y exercises" e botão "Finish"
- [x] Modal de confirmação ao Finish (mostra resumo: volume força + tempo cardio)
- [x] Página `/workout/plans` (CRUD)
- [x] Página `/workout/plans/:id/edit` com drag-to-reorder e suporte a cardio
- [x] Página `/workout/history` (lista por semana)
- [x] Página de detalhe de sessão passada (read-only) — exibe ambos os tipos

---

## Fase 3 — Progresso e atividade

### F3.1 — Services de progresso 🔴 ⏱️ 8h
- [ ] `WeightLogService.create(dto, userId)`
- [ ] `WeightLogService.update(id, dto, userId)`
- [ ] `WeightLogService.delete(id, userId)`
- [ ] `WeightLogService.list(filter, userId)` — paginado
- [ ] `StepLogService.create(dto, userId)` — múltiplos por dia OK
- [ ] `StepLogService.update(id, dto, userId)`
- [ ] `StepLogService.delete(id, userId)`
- [ ] `StepLogService.list(filter, userId)` — paginado
- [ ] **`StepLogService.getStepsForDate(date, userId)`** — política: maior valor entre os logs do dia (ver ADR 007)
- [ ] **`StepLogService.getHistory(days, userId)`** — preenche dias sem log com 0
- [ ] `ProgressService.weightProgress(days, userId)` — pontos + médias semanais + delta
- [ ] `ProgressService.strengthProgress(exerciseId, days, metric, userId)` — agrupa por sessão (apenas força)
- [ ] `ProgressService.cardioProgress(exerciseId, days, metric, userId)` — agrupa por sessão (apenas cardio); valida que exercise é cardio
- [ ] `ProgressService.volumeProgress(days, muscleGroup?, userId)` — semanal, ignora cardio
- [ ] `ProgressService.stepsProgress(days, userId)` — pontos + médias semanais + dias batidos
- [ ] Helper de "início de semana" no fuso do user
- [ ] Helper "data no fuso do user" — recebe Date, retorna string YYYY-MM-DD
- [ ] Tests: cálculo de delta, médias semanais, política de "valor do dia" em passos, cálculo de streak

### F3.2 — Endpoints REST progresso 🟡 ⏱️ 3h
- [ ] CRUD `/weight-logs`
- [ ] CRUD `/step-logs`
- [ ] `GET /step-logs/by-date/:date` (retorna efetivo do dia)
- [ ] `GET /progress/weight?days=`
- [ ] `GET /progress/strength?exerciseId=&days=&metric=`
- [ ] `GET /progress/cardio?exerciseId=&days=&metric=`
- [ ] `GET /progress/volume?days=&muscleGroup=`
- [ ] `GET /progress/steps?days=`

### F3.3 — Tools MCP de progresso 🟡 ⏱️ 5h
- [ ] `log_weight` `update_weight_log` `delete_weight_log` `list_weight_logs`
- [ ] `log_steps` `update_step_log` `delete_step_log` `list_step_logs`
- [ ] `get_steps_for_date` `get_steps_history`
- [ ] `get_weight_progress`
- [ ] `get_strength_progress`
- [ ] `get_cardio_progress`
- [ ] `get_volume_progress`
- [ ] `get_steps_progress`

### F3.4 — Services e tools de Dashboard 🟡 ⏱️ 5h
> Endpoints agregadores que reduzem ida-e-volta. Importantes pro Claude responder "como tô hoje" em uma única chamada.
- [ ] `DashboardService.today(userId)` — combina nutrition + workout + weight + **steps** + streak (incluindo streak de passos)
- [ ] `DashboardService.week(userId)` — agregado semanal incluindo cardio total e passos da semana
- [ ] Endpoint REST `GET /dashboard/today` `GET /dashboard/week`
- [ ] Tool MCP `get_today_summary` (com bloco `steps`)
- [ ] Tool MCP `get_week_summary` (com blocos `cardio` e `steps`)

### F3.5 — PWA Progresso 🟡 ⏱️ 12h
- [ ] Página `/progress` com tabs **Peso | Força | Cardio | Passos**
- [ ] Filtros 14/30/90/180 dias
- [ ] `<WeightChart />` com Recharts (área + linha)
- [ ] `<StrengthChart />` com seletor de exercício e métrica
- [ ] `<CardioChart />` com seletor de exercício de cardio e métrica (duração/distância/pace/kcal)
- [ ] `<StepsChart />` gráfico de barras com linha de meta
- [ ] Modal "Logar peso" (chama `log_weight`)
- [ ] Modal "Logar passos" (chama `log_steps`)
- [ ] Tabela de médias semanais
- [ ] Lista editável de pesos logados (correção)
- [ ] Lista editável de logs de passos (correção)

### F3.6 — Card de passos no Dashboard 🟡 ⏱️ 3h
- [ ] `<StepsCard />` — passos atuais + meta + barra
- [ ] Integração no dashboard chamando `get_today_summary`
- [ ] Botão de log rápido inline

---

## Fase 4 — Polimento

### F4.1 — PWA installable 🟡 ⏱️ 3h
- [ ] Manifest completo com ícones
- [ ] Service worker com cache de assets estáticos
- [ ] Ícones 192/512/maskable
- [ ] Testar instalação no iOS e Android

### F4.2 — Onboarding do Claude no PWA 🔴 ⏱️ 3h
> Substitui a antiga "Gerenciamento de tokens MCP" que não existe mais (Logto cuida disso).
- [ ] Página `/profile` mostra dados do usuário (nome, email — read-only)
- [ ] Seção "Conectar ao Claude":
  - [ ] URL do MCP server em destaque com botão copy-to-clipboard (`https://api.fatia.dominio/mcp`)
  - [ ] Instruções passo-a-passo: "1. Abra Claude → Configurações → Conectores → Adicionar; 2. Cole esta URL; 3. Faça login com a mesma conta deste app"
  - [ ] Screenshot ou GIF demonstrando (opcional)
- [ ] Link "Gerenciar sessões ativas" → abre console do Logto
- [ ] Botão "Sair" → encerra sessão local + Logto via SDK

### F4.3 — Dashboard 🟢 ⏱️ 4h
- [ ] Página `/dashboard` com saudação por horário
- [ ] Checklist do dia (peso, refeições, treino) — via `get_today_summary`
- [ ] Atalhos para ações rápidas

### F4.4 — Logout e segurança 🟡 ⏱️ 2h
- [ ] Logout funcional com limpeza de cookie
- [ ] Re-login automático ao expirar JWT
- [ ] Mensagens de erro de auth claras

### F4.5 — Backup automático 🟡 ⏱️ 2h
- [ ] Script `pg_dump` no host
- [ ] Cron diário 4am
- [ ] Retenção 7 dias local
- [ ] Documentar restauração

---

## Tarefas transversais (em paralelo)

### T.1 — Documentação contínua 🟡
- [ ] Atualizar ADRs quando decisão arquitetural mudar
- [ ] README sempre alinhado com comandos atuais
- [ ] Comentários em endpoints MCP (descrição visível para Claude)

### T.2 — Testes mínimos 🟡
- [ ] Tests unitários: cálculo de totais nutricionais
- [ ] Tests unitários: `getLastWeight`
- [ ] Tests integration: guards de auth
- [ ] Tests integration: isolamento user A não vê dados de user B

### T.3 — Setup do servidor de produção 🟡 (~Fase 4)
- [ ] Caddy ou nginx na frente
- [ ] Subdomínios `api.` e `app.`
- [ ] SSL automático
- [ ] Variáveis de ambiente de produção (secrets gerenciados)
- [ ] Deploy inicial e smoke test
- [ ] Configurar primeiro admin

---

## Definition of Done por fase

**Fase 1:** Eu consigo, via Claude no celular, tirar foto de uma refeição, ela ser registrada no servidor, e ver o total do dia atualizado no PWA. Adicionalmente, todas as ~18 tools MCP de nutrição estão funcionais e testadas via MCP Inspector — incluindo CRUD completo de refeições, items, custom foods e metas (com `dailyStepsTarget`).

**Fase 2:** Eu consigo executar um treino completo no PWA, vendo o "previous" de cada exercício e logando todas as séries com peso/reps **ou** com duração/distância para cardio. Treinos híbridos (força + esteira no fim) funcionam. Em paralelo, todas as ~19 tools MCP de treino funcionam — Claude consegue criar planos, adicionar exercícios de força e cardio, iniciar sessões, logar séries e detectar PRs em ambos os tipos.

**Fase 3:** Eu vejo gráficos de evolução de peso, carga (força), cardio (duração/distância) e passos diários nos últimos 30 dias com dados reais. Múltiplos logs de passos no mesmo dia funcionam corretamente (maior valor vence). Tools MCP de progresso, passos e dashboard (~17 tools) retornam dados consistentes pro Claude responder "como tô essa semana" incluindo treinos, cardio e passos.

**Fase 4:** App instalável, multi-usuário em produção, eu e ao menos uma outra pessoa usando há uma semana sem bugs bloqueantes. Onboarding via Logto: novo usuário é criado no console do Logto, recebe instruções, configura o conector MCP no Claude e loga primeira refeição em < 5 minutos. Login único entre PWA e Claude (sessão compartilhada).

## Resumo: cobertura de tools MCP por fase

| Fase | Tools MCP entregues | Acumulado |
|---|---|---|
| F1 (Nutrição) | 16 tools (perfil, metas, food, meal, item, summary) | 16 |
| F2 (Treino) | 19 tools (exercise, plan, plan-exercise, session, set [força+cardio], PR) | 35 |
| F3 (Progresso + Passos + Dashboard) | 17 tools (weight 4 + steps 6 + progress 5 + dashboard 2) | ~52 |
| F4 (Polimento) | 0 novas — apenas correções e documentação | ~52 |
| FX (Migração Logto) | -2 tools (`list_my_tokens`, `revoke_token` removidas) | ~52 |

Total esperado ao fim da v1: **~52 tools MCP**, cobrindo CRUD completo de todas as entidades user-owned (incluindo passos com schema preparado para integrações futuras). Auth via Logto OAuth 2.1.

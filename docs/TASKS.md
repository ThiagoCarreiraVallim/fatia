# Tasks

Checklist completo de implementação. Marca conforme avança. Tarefas filhas (`-`) indicam subtarefas práticas; pais com `[ ]` representam o entregável da fase.

**Legenda:**
- 🔴 Bloqueante — outras tasks dependem desta
- 🟡 Importante — fazer logo, mas não bloqueia
- 🟢 Nice-to-have — pode esperar
- ⏱️ Estimativa em horas (h)

---

## Fase 0 — Setup do projeto

### F0.1 — Inicialização do monorepo 🔴 ⏱️ 2h
- [ ] `pnpm init` na raiz
- [ ] Configurar `pnpm-workspace.yaml` com `apps/*` e `packages/*`
- [ ] Adicionar Turborepo (`pnpm add -Dw turbo`)
- [ ] Criar `turbo.json` com pipelines `dev`, `build`, `typecheck`, `lint`
- [ ] `.gitignore` (node_modules, .env, dist, .next, .turbo)
- [ ] `.editorconfig`
- [ ] `.nvmrc` ou `.tool-versions` com Node 20+
- [ ] Commitar estado inicial

### F0.2 — Docker Compose base 🔴 ⏱️ 1h
- [ ] `infra/docker-compose.yml` com Postgres 16
- [ ] Volume nomeado `fatia_pg_data`
- [ ] Healthcheck no Postgres
- [ ] `.env.example` na raiz com variáveis necessárias
- [ ] Comando documentado no README

### F0.3 — Pacote `db` (Prisma) 🔴 ⏱️ 3h
- [ ] `packages/db/package.json`
- [ ] `pnpm add prisma @prisma/client` no pacote
- [ ] `prisma init`
- [ ] Colar `schema.prisma` final (ver `packages/db/prisma/schema.prisma`)
- [ ] Configurar `output` do client para dentro do pacote
- [ ] Script `db:migrate`, `db:push`, `db:studio`, `db:seed` no `package.json` raiz
- [ ] Primeira migration: `prisma migrate dev --name init`
- [ ] Validar com `prisma studio`

### F0.4 — App `api` (NestJS) 🔴 ⏱️ 3h
- [ ] `nest new api` em `apps/`
- [ ] Configurar para usar pnpm workspace
- [ ] Adicionar `@fatia/db` como dep workspace
- [ ] `nestjs-pino` para logs
- [ ] Configurar `ConfigModule` com validação de env
- [ ] `helmet`, CORS configurado
- [ ] `/health` endpoint
- [ ] Testar `pnpm --filter api dev` sobe na porta 3000

### F0.5 — App `web` (Next.js) 🔴 ⏱️ 2h
- [ ] `npx create-next-app@latest web` em `apps/`
- [ ] App Router, TypeScript, Tailwind, src dir
- [ ] Adicionar shadcn/ui (`npx shadcn@latest init`)
- [ ] Setup tema dark only
- [ ] Configurar `next-pwa` (manifest + sw básico)
- [ ] Layout root com bottom nav placeholder
- [ ] Testar `pnpm --filter web dev` sobe na 3001

### F0.6 — Auth básica 🔴 ⏱️ 6h
- [ ] `AuthModule` no Nest
- [ ] `POST /auth/login` (email + senha → JWT)
- [ ] `POST /auth/signup` (apenas admin pode criar — endpoint protegido por role)
- [ ] `POST /auth/logout` (limpa cookie)
- [ ] `JwtAuthGuard` aplicado globalmente, com `@Public()` decorator para exceções
- [ ] `@CurrentUser()` decorator
- [ ] Hash de senha com argon2
- [ ] Seed manual do primeiro admin via script (`pnpm db:seed:admin`)
- [ ] Tela `/login` no PWA conectada
- [ ] Cookie httpOnly, secure em prod

### F0.7 — Linting e formatação 🟡 ⏱️ 1h
- [ ] ESLint config compartilhada na raiz
- [ ] Prettier config
- [ ] `lint-staged` + `husky` (opcional, ⏱️ +30min)
- [ ] Scripts `lint`, `format`, `typecheck` rodando em todos os pacotes

---

## Fase 1 — Nutrição core

> **Princípio MCP-first (ver ADR 006):** MCP cobre CRUD completo. PWA cobre o essencial pra v1 (visualização do dia, edição básica). Operações faltantes no PWA podem ser feitas via Claude.

### F1.1 — Seed da TACO 🔴 ⏱️ 4h
- [ ] Baixar CSV da Tabela TACO (Unicamp)
- [ ] Salvar em `packages/db/prisma/data/taco.csv`
- [ ] Implementar parser real em `seed-taco.ts` (substituir o stub)
- [ ] Encoding correto (provavelmente latin1)
- [ ] Mapear grupos para `FoodGroup`
- [ ] Upsert idempotente em `Food` (chave: name + source + createdByUserId=null)
- [ ] Validar com 5-10 alimentos comuns
- [ ] Documentar no README

### F1.2 — Services de nutrição 🔴 ⏱️ 6h
- [ ] `FoodService.search(query, opts, userId)` — TACO + customs do user
- [ ] `FoodService.get(id, userId)` — valida acesso
- [ ] `FoodService.createCustom(dto, userId)`
- [ ] `FoodService.updateCustom(id, dto, userId)` — bloqueia TACO
- [ ] `FoodService.deleteCustom(id, userId)`
- [ ] `FoodService.listGroups()`
- [ ] `MealService.create(dto, userId)` — calcula totais a partir de items
- [ ] `MealService.findById(id, userId)`
- [ ] `MealService.list(filter, userId)` — com cursor pagination
- [ ] `MealService.update(id, dto, userId)`
- [ ] `MealService.delete(id, userId)` — cascade items
- [ ] `MealItemService.add(mealId, dto, userId)` — recalcula totais
- [ ] `MealItemService.update(itemId, dto, userId)` — recalcula totais
- [ ] `MealItemService.delete(itemId, userId)` — recalcula totais
- [ ] `NutritionSummaryService.getDay(date, userId)` — agregado
- [ ] `NutritionSummaryService.getHistory(days, userId)` — médias e per-day
- [ ] `UserGoalsService.upsert(dto, userId)` e `.get(userId)` — inclui `dailyStepsTarget` e `weeklyWorkouts`
- [ ] Helper `calcMacrosFromFood(food, grams)` testado
- [ ] Tests unitários: cálculo de totais, snapshot de foodName, isolamento por user

### F1.3 — Endpoints REST nutrição 🟡 ⏱️ 3h
> REST espelha um subset do MCP — apenas o que o PWA usa. Não todos os métodos.
- [ ] `GET /foods/search?q=`
- [ ] `POST /custom-foods` `PATCH /custom-foods/:id` `DELETE /custom-foods/:id`
- [ ] `GET /food-groups`
- [ ] `POST /meals` `GET /meals?date=` `GET /meals/:id` `PATCH /meals/:id` `DELETE /meals/:id`
- [ ] `POST /meals/:id/items` `PATCH /meal-items/:id` `DELETE /meal-items/:id`
- [ ] `GET /nutrition/summary?date=` `GET /nutrition/history?days=`
- [ ] `GET /user-goals` `PUT /user-goals`
- [ ] Todos com `JwtAuthGuard` + `@CurrentUser()`

### F1.4 — MCP infraestrutura 🔴 ⏱️ 6h
- [ ] `pnpm add @modelcontextprotocol/sdk` em `apps/api`
- [ ] `McpModule` com server HTTP (Streamable HTTP transport)
- [ ] `McpAuthGuard` valida bearer, popula `req.user`, atualiza `lastUsedAt`
- [ ] Hashing de tokens com argon2 + comparação constante
- [ ] Endpoint REST `POST /mcp-tokens` (autenticado via JWT) — gera + retorna ÚNICA vez
- [ ] Endpoint REST `GET /mcp-tokens` `DELETE /mcp-tokens/:id`
- [ ] Tool `list_my_tokens` (MCP) — só leitura, lista
- [ ] Tool `revoke_token` (MCP)
- [ ] Tool `get_me` `update_me` `update_timezone`
- [ ] Logging estruturado por tool (name, userId, duration, success)
- [ ] Rate limit por token (`@nestjs/throttler` customizado)
- [ ] Testar localmente com MCP Inspector

### F1.5 — Tools MCP de nutrição 🔴 ⏱️ 8h
> Cada tool é um wrapper fino sobre o Service correspondente. Validação Zod no input.
- [ ] `search_food` `get_food`
- [ ] `create_custom_food` `update_custom_food` `delete_custom_food`
- [ ] `list_food_groups`
- [ ] `log_meal` (a tool central — testar bem)
- [ ] `get_meal` `list_meals` `update_meal` `delete_meal`
- [ ] `add_meal_item` `update_meal_item` `delete_meal_item`
- [ ] `get_nutrition_summary` `get_nutrition_history`
- [ ] `get_nutrition_goals` `set_nutrition_goals`
- [ ] Cada tool com descrição clara (visível ao Claude)
- [ ] Testar fluxos completos de `docs/MCP.md` no MCP Inspector

### F1.6 — PWA Nutrição 🟡 ⏱️ 12h
- [ ] Layout autenticado `(app)/layout.tsx` com bottom nav
- [ ] Página `/` (Hoje) — fetch summary do dia
- [ ] Componente `<DateNavigator />`
- [ ] Componente `<MacroBar />` com cores corretas (range)
- [ ] Componente `<MealGroup />` colapsável por tipo
- [ ] Componente `<MealItemRow />` com swipe-to-delete
- [ ] Modal `<FoodSearch />` para adicionar item (chama `search_food` + `add_meal_item`)
- [ ] Modal de edição de item
- [ ] Página `/nutrition/goals` com form de ranges (kcal, macros, treinos/sem, **passos/dia**)
- [ ] Loading states e empty states
- [ ] Testar em viewport mobile

---

## Fase 2 — Treino core

### F2.1 — Seed de exercícios 🔴 ⏱️ 2h
- [ ] Lista (já presente no `seed-exercises.ts`) com ~60 exercícios incluindo cardio expandido
- [ ] Validar upsert idempotente após mudança de chave composta
- [ ] Cobrir: peito, costas, ombro, braço, pernas, core, **cardio (esteira, bike, natação, corrida, caminhada, HIIT, escada, elíptico, remo, corda)**

### F2.2 — Services de treino 🔴 ⏱️ 10h
- [ ] `ExerciseService.search(query, muscleGroup?, userId)` — públicos + customs
- [ ] `ExerciseService.listByMuscle(group, userId)`
- [ ] `ExerciseService.createCustom(dto, userId)`
- [ ] `ExerciseService.updateCustom(id, dto, userId)`
- [ ] `ExerciseService.deleteCustom(id, userId, force?)` — bloqueia se referenciado
- [ ] `WorkoutPlanService.create(dto, userId)`
- [ ] `WorkoutPlanService.findById(id, userId)` — com exercícios populados
- [ ] `WorkoutPlanService.list(userId)` — com `lastUsedAt`
- [ ] `WorkoutPlanService.update(id, dto, userId)`
- [ ] `WorkoutPlanService.delete(id, userId)` — não cascateia em sessões passadas
- [ ] `WorkoutPlanService.addExercise(planId, dto, userId)`
- [ ] `WorkoutPlanService.updatePlanExercise(peId, dto, userId)`
- [ ] `WorkoutPlanService.removeExercise(peId, userId)`
- [ ] `WorkoutPlanService.reorderExercises(planId, order[], userId)` — transaction
- [ ] `WorkoutSessionService.start(planId?, dto, userId)` — retorna prefilled
- [ ] `WorkoutSessionService.findById(id, userId)` — com sets + agregados (volume força + duração cardio)
- [ ] `WorkoutSessionService.list(filter, userId)` — paginado
- [ ] `WorkoutSessionService.update(id, dto, userId)`
- [ ] `WorkoutSessionService.finish(id, dto, userId)` — idempotente
- [ ] `WorkoutSessionService.delete(id, userId)`
- [ ] **`SessionSetService.create(sessionId, dto, userId)` — valida conforme tipo do exercício:**
  - Força: exige `weightKg + reps`, rejeita campos de cardio
  - Cardio: exige `durationSeconds`, rejeita campos de força
  - Auto setNumber, detecta PR
- [ ] `SessionSetService.update(id, dto, userId)` — mesma validação
- [ ] `SessionSetService.delete(id, userId)`
- [ ] `SessionSetService.getLastForExercise(exerciseId, userId, before?)` — retorna campos relevantes
- [ ] `SessionSetService.getPersonalRecord(exerciseId, userId, metric)` — métrica varia por tipo
- [ ] Helper `estimate1RM(weight, reps)` (Epley) testado
- [ ] Helper `calculatePace(durationSeconds, distanceMeters)` testado
- [ ] Helper `isCardioExercise(exercise)` — `muscleGroup === 'cardio'`
- [ ] Tests: `getLastForExercise` força e cardio, `getPersonalRecord` ambos, validação por tipo, treino híbrido

### F2.3 — Endpoints REST treino 🟡 ⏱️ 4h
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
- [ ] `search_exercise` `list_exercises_by_muscle`
- [ ] `create_custom_exercise` `update_custom_exercise` `delete_custom_exercise`
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

### F4.2 — Gerenciamento de tokens MCP 🔴 ⏱️ 4h
> Crítico para onboarding de usuário no Claude. Sem isso, ninguém consegue usar o MCP.
- [ ] Página `/profile`
- [ ] Listar tokens com label, criado em, último uso
- [ ] Modal "Criar token" → input de label → POST → mostra UMA VEZ com copy
- [ ] Aviso "salve agora, não mostraremos de novo"
- [ ] Botão revogar com confirmação
- [ ] Instruções de como configurar no Claude (texto + screenshot)

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

**Fase 4:** App instalável, multi-usuário em produção, eu e ao menos uma outra pessoa usando há uma semana sem bugs bloqueantes. Onboarding de token MCP funcional — outro usuário consegue gerar token no PWA, configurar no Claude e logar primeira refeição em < 5 minutos.

## Resumo: cobertura de tools MCP por fase

| Fase | Tools MCP entregues | Acumulado |
|---|---|---|
| F1 (Nutrição) | 18 tools (perfil, tokens, metas, food, meal, item, summary) | 18 |
| F2 (Treino) | 19 tools (exercise, plan, plan-exercise, session, set [força+cardio], PR) | 37 |
| F3 (Progresso + Passos + Dashboard) | 17 tools (weight 4 + steps 6 + progress 5 + dashboard 2) | ~54 |
| F4 (Polimento) | 0 novas — apenas correções e documentação | ~54 |

Total esperado ao fim da v1: **~54 tools MCP**, cobrindo CRUD completo de todas as entidades user-owned (incluindo passos com schema preparado para integrações futuras).

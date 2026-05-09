# Plano — Conclusão da Fase 1 (Nutrição core)

## Contexto

A Fase 0 está concluída (monorepo, Docker, Prisma, NestJS, Next.js, auth JWT, lint). A branch atual `feat/nutrition-core` está limpa. O schema Prisma já contém todos os modelos necessários para nutrição (`User`, `UserGoals`, `FoodGroup`, `Food`, `Meal`, `MealItem`, `McpToken`) com índices e constraints corretas. O que falta é construir, em ordem, o pipeline completo de Nutrição: catálogo TACO real, services Nest, endpoints REST, infraestrutura MCP, tools MCP de nutrição e o PWA Nutrição.

**Decisões definidas com o usuário:**

- Plano cobre F1.1→F1.6 integralmente.
- CSV da TACO precisa ser baixado (NEPA/Unicamp); incluir esta etapa.
- PWA consome **REST** (cookie JWT) — MCP é exclusivo do Claude.

**Definition of Done da Fase 1:** registrar refeição via Claude (MCP) e ver o total do dia atualizado no PWA; ~18 tools MCP funcionais no MCP Inspector.

---

## Arquivos críticos (criar/modificar)

**packages/db**

- `prisma/data/taco.csv` (novo — dados TACO)
- `prisma/seed-taco.ts` (substituir stub por parser real)

**apps/api/src** — criar módulos novos:

- `nutrition/` — `nutrition.module.ts`, `food.service.ts`, `meal.service.ts`, `meal-item.service.ts`, `nutrition-summary.service.ts`, `user-goals.service.ts`, `nutrition.controller.ts`, `dto/*.ts`, `helpers/calc-macros.ts`
- `mcp/` — `mcp.module.ts`, `mcp.controller.ts`, `mcp-auth.guard.ts`, `mcp-token.service.ts`, `tools/*.ts` (uma tool por arquivo), `schemas/*.ts` (Zod)
- `app.module.ts` — registrar `NutritionModule`, `McpModule`

**apps/api/package.json** — adicionar `@modelcontextprotocol/sdk`.

**apps/web/src** — criar:

- `app/providers.tsx` (TanStack Query)
- `app/(app)/nutrition/page.tsx` (substituir placeholder por "Hoje")
- `app/(app)/nutrition/goals/page.tsx`
- `app/(app)/profile/tokens/page.tsx` (gestão de tokens MCP — também atende F4.2)
- `components/nutrition/*` — `DateNavigator`, `MacroBar`, `MealGroup`, `MealItemRow`, `FoodSearchModal`, `MealItemEditModal`
- `lib/api/nutrition.ts` — wrappers REST tipados

---

## Ordem de execução (com checkpoints)

### Etapa 1 — F1.1: Seed TACO real (4h)

1. Baixar CSV da TACO: https://www.nepa.unicamp.br/taco/contar/v2/tabelas/CompletaBR.xls (converter `.xls`→`.csv` com encoding `latin1`) ou usar o CSV publicado pela Unicamp. Salvar em `packages/db/prisma/data/taco.csv`.
2. Em `seed-taco.ts`:
   - Trocar o array hardcoded por parser de CSV (usar `csv-parse` ou parsing manual; `tsx` já roda TS direto).
   - Detectar encoding `latin1` no `fs.readFile`.
   - Mapear colunas reais → `{name, group, kcal, proteinG, carbsG, fatG}`. Nomear o `FoodGroup` mantendo nome do CSV (ex.: "Cereais e derivados", "Frutas e derivados").
   - Manter pipeline idempotente atual (`findFirst` + `create/update`, chave: `name + source=TACO + createdByUserId=null`).
   - Validar com 5–10 alimentos comuns (arroz, feijão, frango, banana, ovo).
3. Atualizar `README.md` da raiz com instrução do download.
4. **Checkpoint:** `pnpm db:seed:taco` insere ≥500 alimentos sem duplicar em segunda execução.

### Etapa 2 — F1.2: Services de nutrição (6h)

Criar `apps/api/src/nutrition/` com os services listados em TASKS.md:298-301:

1. `helpers/calc-macros.ts`: `calcMacrosFromFood(food, grams)` → `{kcal, proteinG, carbsG, fatG}` (regra de 3 simples, arredondamento 2 casas).
2. `food.service.ts`: `search`, `get`, `createCustom`, `updateCustom`, `deleteCustom`, `listGroups`. Sempre filtrar por `userId` no SELECT (TACO público + customs do user). `updateCustom`/`deleteCustom` rejeitam `source !== CUSTOM`.
3. `meal.service.ts`: `create`, `findById`, `list` (cursor pagination — date + id), `update`, `delete`. `create` aceita items inline e calcula totais usando `calcMacrosFromFood` + snapshot de `foodName` em cada item.
4. `meal-item.service.ts`: `add`, `update`, `delete` — **recalcula totais do `Meal` em transação** (`prisma.$transaction`).
5. `nutrition-summary.service.ts`: `getDay(date, userId)` — agrega refeições do dia no fuso do user; `getHistory(days, userId)` — médias e per-day.
6. `user-goals.service.ts`: `upsert` e `get`, incluindo `dailyStepsTarget` e `weeklyWorkouts`.
7. **Tests unitários** (Jest, padrão Nest):
   - `calcMacrosFromFood` — casos limite (0g, valores fracionários).
   - `MealService.create` — totais corretos a partir de items.
   - Snapshot de `foodName` preservado quando `Food` é deletado.
   - Isolamento: user A não enxerga meals do user B.

Padrão a seguir: services puros, sem `Request`; controllers passam `userId` via `@CurrentUser()`. Reutilizar `PrismaService` de `common/prisma.service.ts`.

### Etapa 3 — F1.3: Endpoints REST nutrição (3h)

Criar `nutrition.controller.ts` com os 16 endpoints de TASKS.md:130-135. Padrões:

- `JwtAuthGuard` é global; rotas já protegidas. Usar `@CurrentUser() user`.
- DTOs com `class-validator` (whitelist + transform já globais em `main.ts`).
- Cursor pagination em `GET /meals` (`?cursor=...&limit=20`).
- Prefixo global `/api` já configurado.

### Etapa 4 — F1.4: MCP infraestrutura (6h)

1. `pnpm --filter api add @modelcontextprotocol/sdk`.
2. `apps/api/src/mcp/`:
   - `mcp-token.service.ts`: `create(userId, label)` (gera 32 bytes random base64url, hasheia com argon2, retorna plaintext UMA vez), `list(userId)`, `revoke(id, userId)`, `validate(plaintext)` (compara constante via argon2.verify percorrendo tokens ativos do user — index por `userId`).
   - `mcp-tokens.controller.ts`: `POST /api/mcp-tokens`, `GET /api/mcp-tokens`, `DELETE /api/mcp-tokens/:id` (todas com JWT).
   - `mcp-auth.guard.ts`: lê `Authorization: Bearer`, chama `validate`, popula `req.user` no formato `CurrentUserPayload`, atualiza `lastUsedAt`.
   - `mcp.module.ts` + `mcp.controller.ts`: monta MCP Server (Streamable HTTP transport) em `/mcp` (já excluído do prefixo `/api` em `main.ts:setGlobalPrefix`).
   - Logging via `nestjs-pino` (já configurado): `{tool, userId, durationMs, success}`.
   - Rate limit por token usando `@nestjs/throttler` (já instalado) com `tracker` customizado (`ThrottlerGuard` por `userId`).
3. Tools meta: `get_me`, `update_me`, `update_timezone`, `list_my_tokens`, `revoke_token` (nova ID válida).
4. **Checkpoint:** rodar MCP Inspector contra `http://localhost:3000/mcp` com Bearer válido — listar tools, executar `get_me`.

### Etapa 5 — F1.5: Tools MCP de nutrição (8h)

Criar uma tool por arquivo em `apps/api/src/mcp/tools/`. Cada tool: schema **Zod** no input, descrição clara (visível ao Claude), wrapper fino que delega ao service apropriado e propaga `userId` do `req.user`.

Lista (16 tools de nutrição + 5 meta = ~21; TASKS.md prevê ~18, ajustar se necessário):

- food: `search_food`, `get_food`, `create_custom_food`, `update_custom_food`, `delete_custom_food`, `list_food_groups`
- meal: `log_meal`, `get_meal`, `list_meals`, `update_meal`, `delete_meal`
- meal-item: `add_meal_item`, `update_meal_item`, `delete_meal_item`
- summary/goals: `get_nutrition_summary`, `get_nutrition_history`, `get_nutrition_goals`, `set_nutrition_goals`

`log_meal` é central — testar bem (foto → items estimados → snapshot de foodName mesmo sem `foodId`).

**Checkpoint:** rodar todos os fluxos descritos em `docs/MCP.md` no MCP Inspector.

### Etapa 6 — F1.6: PWA Nutrição (12h)

1. `app/providers.tsx`: `QueryClientProvider` (TanStack Query) — envolver em `app/(app)/layout.tsx`. (TanStack Query está instalado mas sem provider.)
2. `lib/api/nutrition.ts`: tipos + funções `getSummary(date)`, `getMeals(date)`, `addMealItem(...)`, `updateMealItem`, `deleteMealItem`, `searchFoods(q)`, `getGoals`, `putGoals`. Reusar `apiFetch` de `lib/api.ts:1` (já manda `credentials: 'include'`).
3. `app/(app)/nutrition/page.tsx`: página "Hoje" — `useQuery` em `getSummary(date)` + `getMeals(date)`.
4. Componentes em `components/nutrition/`:
   - `DateNavigator` — controla query param `?date=`.
   - `MacroBar` — barras coloridas com ranges das goals (verde dentro, amarelo borda, vermelho fora).
   - `MealGroup` — agrupa por `mealType`, colapsável.
   - `MealItemRow` — swipe-to-delete (touch events; sem dep nova).
   - `FoodSearchModal` — usa `Dialog` de `@radix-ui` (já instalado), debounce 300ms, chama `searchFoods` + `addMealItem`.
   - `MealItemEditModal` — edita gramas, recalcula via backend.
5. `app/(app)/nutrition/goals/page.tsx`: form com `react-hook-form` + Zod, ranges (kcal min/max, macros, treinos/sem, **passos/dia**).
6. Loading states (skeleton) e empty states.
7. Testar viewport mobile (Chrome DevTools mobile emulation).

**Funções existentes a reusar:**

- `apiFetch` — `apps/web/src/lib/api.ts`
- `BottomNav` — `apps/web/src/components/layout/bottom-nav.tsx`
- shadcn primitives — `components/ui/{button,card,form,input,label}.tsx`

---

## Verificação end-to-end (DoD da Fase 1)

1. **Backend isolado:** `pnpm --filter api dev` sobe limpo; `curl -b cookie.txt http://localhost:3000/api/nutrition/summary?date=2026-05-07` retorna JSON.
2. **MCP Inspector:** configurar token gerado no PWA, executar `log_meal` com 2 items (1 da TACO, 1 livre por nome) → ver no banco via `pnpm db:studio`.
3. **PWA:** abrir `/nutrition` no mesmo dia, ver os 2 items somando os macros, total atualizado, MacroBar refletindo as goals.
4. **Isolamento:** logar como user B → `/nutrition` vazio (não vê dados de A).
5. **Tests:** `pnpm --filter api test` — services com cobertura nos cálculos críticos.
6. **Lint/types:** `pnpm typecheck && pnpm lint` na raiz.

---

## Convenções a respeitar (de `docs/CLAUDE.md`)

- YAGNI > DRY; sem abstrações antes da 2ª repetição.
- `strict: true`, sem `any`.
- DTOs com `class-validator` para REST, Zod para MCP.
- Nunca aceitar `userId` como parâmetro de controller — sempre `@CurrentUser()`.
- Index em qualquer `[userId, X]` que for filtrado (já contemplado no schema atual).
- Conventional Commits por sub-fase: `feat(nutrition): ...`, `feat(mcp): ...`.

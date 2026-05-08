# Workout F2a — Design (catálogo + sessão livre + log de sets)

## Contexto

Fase 2 (Treino core) inteira é grande demais para um único spec. Decompomos verticalmente:

- **F2a (este doc):** catálogo de exercícios + sessões livres + log de sets + queries (lastSet, PR). Ponta-a-ponta via MCP, REST mínimo, PWA "sessão ativa".
- **F2b (futuro):** WorkoutPlan, plan-driven sessions, drag-to-reorder, página de planos.
- **F2c (futuro):** página de histórico, detalhe de sessão passada.

Schema Prisma (já existente, sem migration necessária):

- `Exercise` — catálogo público (TACO equivalente) + customs por user. `muscleGroup: string` (`"peito"`, `"costas"`, `"pernas"`, `"ombro"`, `"braço"`, `"core"`, `"cardio"`).
- `WorkoutSession` — `planId?`, `startedAt`, `completedAt?`. F2a só usa modo livre (`planId = null`).
- `SessionSet` — campos de força (`weightKg`, `reps`, `rpe?`) **e** cardio (`durationSeconds`, `distanceMeters?`, `avgHeartRate?`, `kcalBurned?`) coexistindo opcionalmente.

## Objetivos

- Iniciar treino livre via MCP/REST → logar sets de força ou cardio → finalizar → consultar último set / PR de qualquer exercício.
- Validação por tipo (`isCardio(exercise)`) é dupla: schema Zod discriminado nas tools MCP **e** verificação no service (Claude pode mandar `kind:'cardio'` num exercício de força — service rejeita).
- PWA suficiente para o uso humano "treino agora": iniciar, ver progresso, logar set, terminar.

## Não-escopo F2a

- WorkoutPlan / WorkoutPlanExercise (schema existe mas fica intocado).
- Página de histórico, detalhe de sessão passada.
- Estimativa 1RM e pace **como métricas de PR** (helpers ficam prontos para F2b/UI).

## Componentes backend

### `apps/api/src/workout/` (novo módulo)

#### Helpers — `helpers/`

- `is-cardio.ts`
  ```ts
  export const isCardioExercise = (ex: { muscleGroup: string }) => ex.muscleGroup === 'cardio';
  ```
- `estimate-1rm.ts`
  ```ts
  // Epley: 1RM = weight * (1 + reps/30). Não é PR no v1, mas helper testado para futuro.
  export const estimate1RM = (weightKg: number, reps: number) =>
    Math.round(weightKg * (1 + reps / 30) * 100) / 100;
  ```
- `calculate-pace.ts`
  ```ts
  // Retorna segundos por km. Helper para futuro; não é métrica de PR no v1.
  export const calculatePace = (durationSeconds: number, distanceMeters: number): number | null => {
    if (distanceMeters <= 0) return null;
    return Math.round((durationSeconds / distanceMeters) * 1000);
  };
  ```

#### DTOs — `dto/`

- `exercise.dto.ts` — `CreateCustomExerciseDto { name, muscleGroup }`, `UpdateCustomExerciseDto { name?, muscleGroup? }`, `SearchExercisesDto { q?, muscleGroup?, limit? }`.
- `session.dto.ts` — `StartSessionDto { startedAt?, notes? }`, `FinishSessionDto { notes? }`, `ListSessionsDto { date?, cursor?, limit? }`.
- `set.dto.ts`:
  ```ts
  export class LogStrengthSetDto {
    @IsUUID() sessionId!: string;
    @IsInt() exerciseId!: number;
    @IsNumber() @Min(0) weightKg!: number;
    @IsInt() @Min(0) reps!: number;
    @IsOptional() @IsNumber() @Min(0) @Max(10) rpe?: number;
    @IsOptional() @IsString() @MaxLength(500) notes?: string;
  }
  export class LogCardioSetDto {
    @IsUUID() sessionId!: string;
    @IsInt() exerciseId!: number;
    @IsInt() @Min(1) durationSeconds!: number;
    @IsOptional() @IsNumber() @Min(0) distanceMeters?: number;
    @IsOptional() @IsInt() @Min(0) avgHeartRate?: number;
    @IsOptional() @IsInt() @Min(0) kcalBurned?: number;
    @IsOptional() @IsString() @MaxLength(500) notes?: string;
  }
  // Update equivalents sem sessionId/exerciseId, todos opcionais.
  ```

#### Services

- `exercise.service.ts`
  - `search(userId, { q?, muscleGroup?, limit? })` — `OR: [{ createdByUserId: null }, { createdByUserId: userId }]`, ordenado por nome, default limit 20 / max 50.
  - `listByMuscle(userId, muscleGroup)` — mesmo filtro, sem search.
  - `get(userId, id)` — valida acesso (público OU custom do user).
  - `createCustom(userId, dto)` — `Exercise.create({ ...dto, createdByUserId: userId })`. Captura `P2002` (unique `[name, createdByUserId]`) → `ConflictException`.
  - `updateCustom(userId, id, dto)` — só se `createdByUserId === userId`, senão `ForbiddenException`.
  - `deleteCustom(userId, id)` — só custom do user. Se houver `sessionSets` referenciando, rejeita (`ConflictException 'in use'`). Snapshot de sets passados é mantido pelo `restrict` da FK.

- `workout-session.service.ts`
  - `start(userId, dto)` — cria `WorkoutSession { userId, planId: null, startedAt: dto.startedAt ?? now, notes: dto.notes }`.
  - `findById(userId, id)` — `findFirst({ where: { id, userId }, include: { sets: { include: { exercise: true }, orderBy: [{ exerciseId: 'asc' }, { setNumber: 'asc' }] } } })`. Lança `NotFoundException` se nulo.
  - `list(userId, { date?, cursor?, limit? })` — cursor pagination por `id`, ordem `startedAt desc, id desc`. Filtra `date` por intervalo UTC do dia (mesmo padrão de `MealService.list`).
  - `finish(userId, id, dto)` — `assertOwner` + `update { completedAt: completedAt ?? now, notes: dto.notes ?? notes }`. Idempotente (re-chamar não muda `completedAt` se já setado).
  - `update(userId, id, { notes? })` — `assertOwner` + update.
  - `delete(userId, id)` — `assertOwner` + delete (cascade de sets via Prisma).
  - `assertOwner` privado (mesmo padrão de `MealService`).

- `session-set.service.ts`
  - `create(userId, dto: LogStrengthSetDto | LogCardioSetDto)`:
    1. Carrega session (`assertOwnerSession`) + exercise.
    2. `isCardio = isCardioExercise(exercise)`.
    3. Se `isCardio` e `dto` tem `weightKg/reps` → `BadRequestException 'Exercício de cardio requer durationSeconds'`. Inverso idem.
    4. `setNumber = (max(setNumber where sessionId, exerciseId) ?? 0) + 1`.
    5. `prisma.sessionSet.create(...)`.
  - `update(userId, id, dto)` — `assertOwnerSet` + update; reaplica validação de tipo se algum campo de força/cardio mudar.
  - `delete(userId, id)` — `assertOwnerSet` + delete.
  - `getLastForExercise(userId, exerciseId, before?)`:
    - `findFirst({ where: { exerciseId, session: { userId, ...(before ? { startedAt: { lt: new Date(before) } } : {}) } }, orderBy: [{ session: { startedAt: 'desc' } }, { setNumber: 'desc' }], include: { exercise: true, session: { select: { startedAt: true } } } })`.
  - `getPersonalRecord(userId, exerciseId)`:
    - Carrega exercise (valida acesso). Se `isCardio`:
      ```ts
      // Maior soma de distanceMeters por sessão.
      const groups = await prisma.sessionSet.groupBy({
        by: ['sessionId'],
        where: { exerciseId, session: { userId }, distanceMeters: { not: null } },
        _sum: { distanceMeters: true, durationSeconds: true },
        orderBy: { _sum: { distanceMeters: 'desc' } },
        take: 1,
      });
      // → { distanceMeters, durationSeconds, sessionDate } ou null.
      ```
    - Senão (força):
      ```ts
      // Maior weightKg absoluto.
      const top = await prisma.sessionSet.findFirst({
        where: { exerciseId, session: { userId }, weightKg: { not: null } },
        orderBy: [{ weightKg: 'desc' }, { reps: 'desc' }],
        select: { weightKg: true, reps: true, session: { select: { startedAt: true } } },
      });
      // → { weightKg, reps, sessionDate } ou null.
      ```

#### Module — `workout.module.ts`

Mesma receita da Fase 1: providers = services + tools (auto-discovery via `McpToolRegistry`). `McpModule` importa `WorkoutModule`.

### Tests (Jest, mesmo padrão da Fase 1)

`workout/helpers/is-cardio.spec.ts`, `estimate-1rm.spec.ts`, `calculate-pace.spec.ts` — pure function tests (1-3 cases each, incluindo distância 0 → null em pace).

`workout/session-set.service.spec.ts` (mocked Prisma):

- `create` força em exercício de força → OK + setNumber correto
- `create` cardio em exercício de cardio → OK
- `create` força em exercício de cardio → `BadRequestException`
- `create` cardio em exercício de força → `BadRequestException`
- `getLastForExercise` filtra por userId via `session.userId`
- `getPersonalRecord` força retorna maior weightKg
- `getPersonalRecord` cardio retorna soma máxima de distância
- `getPersonalRecord` sem registros → null

`workout/exercise.service.spec.ts`:

- `search` aplica `OR createdByUserId` para isolamento
- `deleteCustom` rejeita se há sets referenciando

## Componentes MCP (15 tools)

(5 exercises + 5 sessions + 4 sets + 1 PR query)

Mesma arquitetura modular da Fase 1: 1 tool/arquivo em `apps/api/src/workout/mcp/*.tool.ts`, decorator `@McpTool()`, auto-discovery.

```
exercises (5):
  search_exercise            { q?, muscleGroup?, limit? }
  list_exercises_by_muscle   { muscleGroup }
  create_custom_exercise     { name, muscleGroup }
  update_custom_exercise     { id, name?, muscleGroup? }
  delete_custom_exercise     { id }

sessions (5):
  start_workout              { startedAt?, notes? }
  get_workout_session        { id }
  list_workout_sessions      { date?, cursor?, limit? }
  finish_workout             { id, notes? }                  → idempotente
  delete_workout_session     { id }

sets (4):
  log_set                    Zod discriminated union (kind: 'strength' | 'cardio')
  update_set                 mesmo union, sem sessionId/exerciseId
  delete_set                 { id }
  get_last_set_for_exercise  { exerciseId, before? }

PRs (1):
  get_personal_record        { exerciseId }
```

Schema do `log_set` (no `*.tool.ts`):

```ts
const baseStrength = z.object({
  kind: z.literal('strength'),
  sessionId: z.string().uuid(),
  exerciseId: z.number().int(),
  weightKg: z.number().min(0),
  reps: z.number().int().min(0),
  rpe: z.number().min(0).max(10).optional(),
  notes: z.string().max(500).optional(),
});
const baseCardio = z.object({
  kind: z.literal('cardio'),
  sessionId: z.string().uuid(),
  exerciseId: z.number().int(),
  durationSeconds: z.number().int().min(1),
  distanceMeters: z.number().min(0).optional(),
  avgHeartRate: z.number().int().min(0).optional(),
  kcalBurned: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});
const inputSchema = { input: z.discriminatedUnion('kind', [baseStrength, baseCardio]) } as const;
```

Service ainda revalida tipo lendo `exercise.muscleGroup` para garantir consistência.

## REST (subset para PWA)

```
GET    /api/workout/exercises/search?q=&muscleGroup=
GET    /api/workout/exercises/by-muscle/:group
POST   /api/workout/sessions                       # start (body opcional)
GET    /api/workout/sessions/active                # última sessão com completedAt = null (ou 204)
GET    /api/workout/sessions/:id
POST   /api/workout/sessions/:id/finish
POST   /api/workout/sessions/:id/sets              # log_set, body union
PATCH  /api/workout/sets/:id
DELETE /api/workout/sets/:id
GET    /api/workout/exercises/:id/last-set
```

`GET /sessions/active` é endpoint dedicado para a PWA não precisar fazer `list?completedAt=null`.

Todos com `JwtAuthGuard` + `@CurrentUser()`.

## PWA `/workout`

### Página `apps/web/src/app/(app)/workout/page.tsx`

- `useQuery(['workout','active'])` → se `null`, renderiza estado vazio com botão "Iniciar treino livre" (POST `/sessions` → invalidate).
- Se sessão ativa, renderiza:
  - Header sticky: nome ("Treino livre"), tempo desde `startedAt` (atualiza a cada minuto via `setInterval`), botão "Finalizar".
  - Lista de `<ExerciseCard />` (um por exercício distinto que tem sets logados na sessão).
  - Botão "+ Exercício" abre `<ExerciseSearchDrawer />`. Selecionar exercício adiciona um card vazio (estado local) — o card só "existe" no backend depois que tem 1 set logado.

### Componentes `apps/web/src/components/workout/`

- `exercise-search-drawer.tsx` — espelho do `FoodSearchDrawer`: busca debounced (`searchExercise`), seleciona → callback `onPick(exercise)`. Não loga set; abre o LogSetDrawer.
- `log-set-drawer.tsx` — recebe `{ session, exercise, mode: 'create' | 'edit', initialSet? }`. Renderiza form **força** se `!isCardio(exercise)`:
  - Inputs Kg (number), Reps (int), RPE (number 1-10, opcional).
- Senão **cardio**:
  - Duração mm:ss (parser → durationSeconds), Distância km (×1000 → distanceMeters), FC bpm, Kcal.
- `exercise-card.tsx` — header com `exercise.name` + "Anterior: X" (puxa via `lastSet`). Lista de sets logados (linha por set, editável via `LogSetDrawer` em modo edit; remove via botão).

### Lib `apps/web/src/lib/api/workout.ts`

Wrappers tipados espelhando o REST acima. Tipos:

```ts
export interface Exercise { id: number; name: string; muscleGroup: string; createdByUserId: string | null }
export interface SessionSet { /* todos campos opcionais de força/cardio */ }
export interface WorkoutSession { id; userId; startedAt; completedAt | null; notes; sets: (SessionSet & { exercise: Exercise })[] }
```

### Não-escopo PWA F2a

- `/workout/plans`, `/workout/history`, `/workout/sessions/:id` (read-only) → F2b/F2c.
- Drag-to-reorder → F2b.
- Resumo de Finish (modal com volume/tempo) → F2b.

## Migração / TASKS.md

Marcar em `docs/TASKS.md`:

- F2.1 (seed): incluir só validar idempotência (lista de ~60 exercícios já existe em `seed-exercises.ts`).
- F2.2: marcar tudo o que F2a cobre (services + helpers + tests). Não-escopo F2a fica não-marcado.
- F2.3: marcar subset listado acima.
- F2.4: marcar 15 tools listadas.
- F2.5: marcar página `/workout` ativa + 3 componentes + `lib/api/workout.ts`.

## Verificação

- `pnpm typecheck` ✓ (api + web)
- `pnpm --filter api test` ✓ (specs novos passando)
- `pnpm db:seed` insere ≥60 exercícios incluindo cardio sem duplicar em segunda execução.
- MCP Inspector: `tools/list` retorna 22 (Fase 1) + 15 (F2a) = 37; executar `start_workout` → `log_set` (força) → `log_set` (cardio em outro exercício) → `get_last_set_for_exercise` → `get_personal_record` → `finish_workout`.
- PWA: abrir `/workout`, iniciar sessão, adicionar exercício de força e logar 3 sets, adicionar exercício de cardio e logar 1 set, ver "Anterior: ..." aparecer no segundo set, finalizar.

## Extensão futura (F2b)

- `WorkoutPlan` + `WorkoutPlanExercise` services + tools + página `/workout/plans`.
- `start_workout(planId)` carrega prefilled (todos `targetSets × targetReps`).
- `get_workout_session` agrega volume força + tempo cardio para o resumo de Finish.

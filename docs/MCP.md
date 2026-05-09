# MCP Server — Especificação Completa de Tools

> **Princípio fundamental:** o Fatia é **MCP-first**. Toda funcionalidade disponível no PWA está disponível como tool MCP. O PWA é uma camada de visualização; o Claude é uma camada de ação tão capaz quanto. Se uma operação existe em um, existe no outro.

## Endpoint

```
https://api.fatia.dominio/mcp
```

Transport: **Streamable HTTP** (recomendação atual do MCP, suporta unidirecional e bidirecional).

## Autenticação

**Atualizado pela ADR 008.** O MCP do Fatia usa OAuth 2.1 conforme spec MCP, com identity provider externo (Logto self-hosted). Bearer tokens estáticos foram descontinuados.

### Fluxo de conexão no Claude

1. Usuário no Claude (web ou app) adiciona conector apontando para `https://api.fatia.dominio/mcp`
2. Claude faz GET em `/.well-known/oauth-protected-resource` → recebe URL do auth server (Logto)
3. Claude faz Dynamic Client Registration no Logto (RFC 7591)
4. Claude redireciona usuário pra tela de login do Logto
5. Usuário faz login (mesma conta usada no PWA)
6. Logto emite authorization code → Claude troca por access token + refresh token (PKCE, RFC 7636)
7. Claude armazena tokens, usa em todas chamadas MCP via `Authorization: Bearer <jwt>`
8. Quando expira, Claude usa refresh token automaticamente

### Validação no servidor

Cada request ao `/mcp` passa por validação:
- Assinatura via JWKS público do Logto (cache de chaves)
- `iss` = `LOGTO_ENDPOINT`
- `aud` = `LOGTO_AUDIENCE` (URL do MCP)
- `exp` no futuro
- `sub` presente

`sub` resolve para `User` local. Se não existe, é criado (provisioning lazy) com role `USER`.

### Endpoints discovery

A API NestJS expõe:
- `GET /.well-known/oauth-protected-resource` — retorna metadata indicando o auth server (Logto)

O Logto expõe (em `auth.fatia.dominio`):
- `GET /.well-known/openid-configuration` — metadados OIDC
- `GET /oidc/jwks` — chaves públicas pra validação
- `POST /oidc/register` — Dynamic Client Registration
- `GET /oidc/auth` — authorization endpoint
- `POST /oidc/token` — token endpoint

## Convenções

### Identidade do usuário
Toda tool resolve `userId` implicitamente pelo token. **Nunca** aceitar `userId` como parâmetro de input — vazaria escopo entre usuários.

### IDs
- IDs de entidades user-owned (`Meal`, `WorkoutSession`, etc): UUID string
- IDs de catálogos compartilhados (`Food`, `Exercise`, `FoodGroup`): integer
- Validação: tool retorna `NOT_FOUND` se ID não existe **ou** não pertence ao usuário (mesma resposta para não vazar info)

### Datas e timestamps
- Toda data/datetime é ISO 8601: `2026-05-06`, `2026-05-06T14:30:00-03:00`
- Quando timezone não é especificado, usa-se o `User.timezone` armazenado no perfil
- "Hoje" sempre significa "hoje no fuso do usuário"

### Cálculo de macros
Quando um `MealItem` referencia um `foodId`, **o servidor calcula** kcal/proteínas/carbos/gorduras a partir de `foodPer100g * grams / 100`. Cliente nunca envia esses valores nesse caso.

Quando o item é livre (sem `foodId`), o cliente (Claude) **deve** enviar todos os macros — o servidor confia.

### Erros
Todas as tools retornam erros MCP padrão. Categorias:
- `INVALID_INPUT`: validação Zod falhou (detalha o campo)
- `NOT_FOUND`: recurso não existe ou não pertence ao usuário
- `CONFLICT`: violação de constraint (ex: nome duplicado, sessão já finalizada)
- `UNAUTHORIZED`: token inválido/revogado
- `RATE_LIMITED`: limite excedido (60 req/min por token)

### Paginação
Listagens com potencial de crescer usam cursor-based:
```typescript
{ cursor?: string; limit?: number }  // limit default 20, max 100
// Output: { items: [...], nextCursor?: string }
```

---

## Catálogo de tools (resumo)

| Categoria | Tool | Operação |
|---|---|---|
| **Perfil** | `get_me` | R |
| | `update_me` | U |
| | `update_timezone` | U |
| **Metas** | `get_nutrition_goals` | R |
| | `set_nutrition_goals` | C/U |
| **Alimentos (catálogo)** | `search_food` | R |
| | `get_food` | R |
| | `create_custom_food` | C |
| | `update_custom_food` | U |
| | `delete_custom_food` | D |
| | `list_food_groups` | R |
| **Refeições** | `log_meal` | C |
| | `get_meal` | R |
| | `list_meals` | R |
| | `update_meal` | U |
| | `delete_meal` | D |
| **Itens de refeição** | `add_meal_item` | C |
| | `update_meal_item` | U |
| | `delete_meal_item` | D |
| **Resumo nutricional** | `get_nutrition_summary` | R |
| | `get_nutrition_history` | R |
| **Exercícios (catálogo)** | `search_exercise` | R |
| | `list_exercises_by_muscle` | R |
| | `create_custom_exercise` | C |
| | `update_custom_exercise` | U |
| | `delete_custom_exercise` | D |
| **Planos de treino** | `create_workout_plan` | C |
| | `get_workout_plan` | R |
| | `list_workout_plans` | R |
| | `update_workout_plan` | U |
| | `delete_workout_plan` | D |
| | `add_exercise_to_plan` | C |
| | `update_plan_exercise` | U |
| | `remove_exercise_from_plan` | D |
| | `reorder_plan_exercises` | U |
| **Sessões de treino** | `start_workout` | C |
| | `get_workout_session` | R |
| | `list_workout_sessions` | R |
| | `update_workout_session` | U |
| | `finish_workout` | U |
| | `delete_workout_session` | D |
| **Séries** | `log_set` | C |
| | `update_set` | U |
| | `delete_set` | D |
| | `get_last_set_for_exercise` | R |
| | `get_personal_record` | R |
| **Peso corporal** | `log_weight` | C |
| | `update_weight_log` | U |
| | `delete_weight_log` | D |
| | `list_weight_logs` | R |
| **Passos** | `log_steps` | C |
| | `update_step_log` | U |
| | `delete_step_log` | D |
| | `list_step_logs` | R |
| | `get_steps_for_date` | R |
| | `get_steps_history` | R |
| **Progresso** | `get_weight_progress` | R |
| | `get_strength_progress` | R |
| | `get_volume_progress` | R |
| | `get_cardio_progress` | R |
| | `get_steps_progress` | R |
| **Dashboard** | `get_today_summary` | R |
| | `get_week_summary` | R |

Total: ~52 tools (após remoção das 2 tools de gerenciamento de token MCP). Cada uma documentada abaixo.

---

## Perfil

### `get_me`
Retorna dados do usuário logado.

**Input:** _(nenhum)_

**Output:**
```typescript
{
  id: string;
  email: string;
  name: string;
  timezone: string;
  role: "USER" | "ADMIN";
  createdAt: string;
}
```

### `update_me`
Atualiza nome ou email do próprio usuário.

**Input:**
```typescript
{
  name?: string;
  email?: string;
}
```

**Output:** mesma forma de `get_me`.

**Erros:** `CONFLICT` se email já em uso.

### `update_timezone`
Atualiza fuso horário do usuário. Afeta interpretação de "hoje" em todas as outras tools.

**Input:**
```typescript
{ timezone: string }  // ex: "America/Sao_Paulo"
```

**Output:** `{ timezone: string }`

---

## Metas do usuário

> Embora o nome legado seja "nutrition_goals" pela compatibilidade com a v0 do design, o objeto contém metas de nutrição **e** atividade (treinos por semana, passos por dia).

### `get_nutrition_goals`
Retorna metas atuais. Se o usuário nunca definiu, retorna `null`.

**Output:**
```typescript
{
  kcalMin: number; kcalMax: number;
  proteinMinG: number; proteinMaxG: number;
  carbsMinG: number; carbsMaxG: number;
  fatMinG: number; fatMaxG: number;
  weeklyWorkouts: number;
  dailyStepsTarget: number;
  updatedAt: string;
} | null
```

### `set_nutrition_goals`
Cria ou atualiza metas (upsert). Range com min ≤ max.

**Input:**
```typescript
{
  kcalMin: number; kcalMax: number;
  proteinMinG: number; proteinMaxG: number;
  carbsMinG: number; carbsMaxG: number;
  fatMinG: number; fatMaxG: number;
  weeklyWorkouts: number;
  dailyStepsTarget: number;
}
```

**Output:** mesma forma de `get_nutrition_goals`.

**Erros:** `INVALID_INPUT` se algum `min > max` ou valores negativos.

---

## Alimentos (catálogo)

### `search_food`
Busca em TACO + alimentos custom do usuário.

**Input:**
```typescript
{
  query: string;       // 2+ chars
  source?: "TACO" | "CUSTOM" | "ALL";   // default ALL
  limit?: number;      // default 10, max 50
}
```

**Output:**
```typescript
{
  foods: Array<{
    id: number;
    name: string;
    source: "TACO" | "USDA" | "CUSTOM";
    group: string | null;
    kcalPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  }>;
}
```

### `get_food`
**Input:** `{ foodId: number }`  
**Output:** mesmo formato de um item de `search_food`.

### `create_custom_food`
Cria um alimento privado do usuário. Útil pra produtos industrializados ou receitas frequentes ("minha shake matinal").

**Input:**
```typescript
{
  name: string;
  groupId?: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}
```

**Output:** `{ foodId: number }`

> **Nota:** custom foods são associados ao criador. Outros usuários não veem. Internamente, isso é modelado adicionando `createdByUserId` opcional em `Food` quando `source = CUSTOM`.

### `update_custom_food`
Atualiza alimento custom próprio. Não pode editar TACO (`source = TACO`).

**Input:**
```typescript
{
  foodId: number;
  name?: string;
  groupId?: number;
  kcalPer100g?: number;
  proteinPer100g?: number;
  carbsPer100g?: number;
  fatPer100g?: number;
}
```

**Output:** alimento atualizado.

**Erros:** `NOT_FOUND` se não pertence ao usuário ou se é TACO.

### `delete_custom_food`
Deleta alimento custom. Refeições que usaram esse alimento mantêm o snapshot via `MealItem.foodName` (ver ADR sobre snapshot).

**Input:** `{ foodId: number }`  
**Output:** `{ deleted: true }`

### `list_food_groups`
**Input:** _(nenhum)_  
**Output:** `{ groups: Array<{ id: number; name: string }> }`

---

## Refeições

### `log_meal`
Cria uma refeição com seus itens em uma única chamada. Tool principal usada pelo Claude após análise de foto/texto.

**Input:**
```typescript
{
  mealType: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  eatenAt?: string;     // ISO datetime; default: agora no fuso do user
  notes?: string;
  items: Array<
    | {
        // Item vinculado à TACO/Custom — servidor calcula macros
        foodId: number;
        grams: number;
        foodName?: string;    // override opcional do snapshot
      }
    | {
        // Item livre — Claude estima e envia tudo
        foodName: string;
        grams: number;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        groupId?: number;
      }
  >;
}
```

**Output:**
```typescript
{
  mealId: string;
  totals: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}
```

### `get_meal`
**Input:** `{ mealId: string }`  
**Output:**
```typescript
{
  id: string;
  mealType: MealType;
  eatenAt: string;
  notes: string | null;
  items: Array<{
    id: string;
    foodId: number | null;
    foodName: string;
    grams: number;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    group: string | null;
  }>;
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}
```

### `list_meals`
Lista refeições por filtro de data.

**Input:**
```typescript
{
  date?: string;          // ISO date — atalho para from=date 00:00, to=date 23:59
  from?: string;          // ISO datetime
  to?: string;            // ISO datetime
  mealType?: MealType;    // filtro opcional
  limit?: number;         // default 50
  cursor?: string;
}
```

**Output:** `{ meals: [...], nextCursor?: string }` onde cada `meal` tem o mesmo formato de `get_meal`.

### `update_meal`
Atualiza metadados da refeição (não os itens — use as tools de itens).

**Input:**
```typescript
{
  mealId: string;
  mealType?: MealType;
  eatenAt?: string;
  notes?: string;
}
```

**Output:** refeição atualizada.

### `delete_meal`
Deleta refeição e todos os seus itens (cascade).

**Input:** `{ mealId: string }`  
**Output:** `{ deleted: true }`

---

## Itens de refeição

### `add_meal_item`
Adiciona um item a uma refeição existente.

**Input:** mesmo shape do array `items[]` em `log_meal`, mais `mealId`.
```typescript
{
  mealId: string;
  // ... um dos dois shapes (vinculado ou livre)
}
```

**Output:**
```typescript
{
  itemId: string;
  mealTotals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}
```

### `update_meal_item`
Corrige um item já logado. **Caso de uso central:** "na verdade era 200g, não 150g".

**Input:**
```typescript
{
  itemId: string;
  // Para item vinculado a Food: basta atualizar grams; servidor recalcula macros
  grams?: number;
  foodId?: number;          // permite trocar o food
  foodName?: string;
  // Para item livre: pode atualizar macros diretamente
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  groupId?: number;
}
```

**Output:** item atualizado + totais da refeição.

### `delete_meal_item`
**Input:** `{ itemId: string }`  
**Output:**
```typescript
{
  deleted: true;
  mealTotals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}
```

---

## Resumo nutricional

### `get_nutrition_summary`
Resumo de um dia (consumo vs. metas).

**Input:**
```typescript
{
  date?: string;   // default hoje
}
```

**Output:**
```typescript
{
  date: string;
  goals: NutritionGoals | null;
  consumed: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  byMealType: {
    BREAKFAST: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    LUNCH: { ... };
    DINNER: { ... };
    SNACK: { ... };
  };
  meals: Array<MealSummary>;  // mesmas refeições, formato simplificado
}
```

### `get_nutrition_history`
Resumo agregado por dia em um período.

**Input:**
```typescript
{
  days: 7 | 14 | 30 | 90;
}
```

**Output:**
```typescript
{
  days: Array<{
    date: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    metGoals: boolean | null;   // true se ficou no range, null se sem metas
  }>;
  averages: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}
```

---

## Exercícios (catálogo)

### `search_exercise`
**Input:**
```typescript
{
  query: string;
  muscleGroup?: string;
  limit?: number;
}
```

**Output:**
```typescript
{
  exercises: Array<{
    id: number;
    name: string;
    muscleGroup: string;
    isCustom: boolean;
  }>;
}
```

### `list_exercises_by_muscle`
**Input:** `{ muscleGroup: string }`  
**Output:** mesmo shape de `search_exercise`.

### `create_custom_exercise`
Cria exercício custom do usuário (não polui o catálogo global).

**Input:**
```typescript
{
  name: string;
  muscleGroup: string;
}
```

**Output:** `{ exerciseId: number }`

### `update_custom_exercise`
**Input:**
```typescript
{
  exerciseId: number;
  name?: string;
  muscleGroup?: string;
}
```

**Erros:** `NOT_FOUND` se não é custom do usuário.

### `delete_custom_exercise`
**Input:** `{ exerciseId: number }`

**Erros:** `CONFLICT` se exercício está referenciado em sets/planos. Cliente deve usar `force: true` pra deletar mesmo assim (orphan'ará histórico — sets ainda existem mas perdem a FK; alternativa: bloquear delete e mandar arquivar).

> **Decisão pendente:** se vamos permitir delete cascateado ou apenas "archive". Por padrão na v1: bloqueia delete se há sets, force-flag pra cascade.

---

## Planos de treino

### `create_workout_plan`
Cria um plano vazio.

**Input:**
```typescript
{
  name: string;            // "Push", "Pull A", "Leg Heavy"
}
```

**Output:** `{ planId: string }`

### `get_workout_plan`
**Input:** `{ planId: string }`  
**Output:**
```typescript
{
  id: string;
  name: string;
  exercises: Array<{
    id: string;            // id do PlanExercise (não do Exercise)
    exerciseId: number;
    exerciseName: string;
    muscleGroup: string;
    order: number;
    targetSets: number;
    targetReps: string;    // "8-12", "5", "AMRAP"
  }>;
  createdAt: string;
}
```

### `list_workout_plans`
**Input:** _(nenhum)_  
**Output:**
```typescript
{
  plans: Array<{
    id: string;
    name: string;
    exerciseCount: number;
    lastUsedAt: string | null;   // quando foi a última sessão
  }>;
}
```

### `update_workout_plan`
**Input:**
```typescript
{
  planId: string;
  name?: string;
}
```

### `delete_workout_plan`
**Input:** `{ planId: string }`  
**Output:** `{ deleted: true }`

> **Nota:** sessões já realizadas com esse plano mantêm `planId` (não cascateia). Sessões futuras perdem a referência.

### `add_exercise_to_plan`
**Input:**
```typescript
{
  planId: string;
  exerciseId: number;
  order?: number;          // default: append
  targetSets: number;
  targetReps: string;
}
```

**Output:** `{ planExerciseId: string }`

### `update_plan_exercise`
Edita um item dentro do plano.

**Input:**
```typescript
{
  planExerciseId: string;
  order?: number;
  targetSets?: number;
  targetReps?: string;
}
```

### `remove_exercise_from_plan`
**Input:** `{ planExerciseId: string }`

### `reorder_plan_exercises`
Reordena tudo de uma vez (mais previsível que ajustar `order` um a um).

**Input:**
```typescript
{
  planId: string;
  exerciseOrder: string[];   // array de planExerciseId na ordem desejada
}
```

**Output:** `{ updated: true }`

---

## Sessões de treino

### `start_workout`
Inicia uma sessão. Pode ser livre ou baseada em plano.

**Input:**
```typescript
{
  planId?: string;
  startedAt?: string;      // default: now
  notes?: string;
}
```

**Output:**
```typescript
{
  sessionId: string;
  startedAt: string;
  plan: { id: string; name: string } | null;
  // Se baseada em plano, retorna exercícios do plano com últimas cargas
  prefilledExercises?: Array<{
    exerciseId: number;
    exerciseName: string;
    targetSets: number;
    targetReps: string;
    lastSet: { weightKg: number; reps: number; loggedAt: string } | null;
  }>;
}
```

> **Decisão chave:** retornar `prefilledExercises` com `lastSet` no `start_workout` é o que torna a UX "mostrar previous" trivial. Cliente não precisa fazer N chamadas.

### `get_workout_session`
**Input:** `{ sessionId: string }`  
**Output:**
```typescript
{
  id: string;
  planId: string | null;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  sets: Array<{
    id: string;
    exerciseId: number;
    exerciseName: string;
    setNumber: number;
    weightKg: number;
    reps: number;
    rpe: number | null;
    notes: string | null;
  }>;
  // Agregados úteis
  totalVolumeKg: number;       // soma de weight*reps
  exerciseCount: number;
}
```

### `list_workout_sessions`
**Input:**
```typescript
{
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}
```

**Output:** `{ sessions: [...], nextCursor?: string }` com formato resumido de cada sessão.

### `update_workout_session`
**Input:**
```typescript
{
  sessionId: string;
  notes?: string;
  startedAt?: string;     // permite corrigir "esqueci de iniciar"
}
```

### `finish_workout`
Marca sessão como concluída. Idempotente — chamar de novo só atualiza notes/completedAt.

**Input:**
```typescript
{
  sessionId: string;
  completedAt?: string;   // default: now
  notes?: string;
}
```

**Output:**
```typescript
{
  sessionId: string;
  completedAt: string;
  summary: {
    totalSets: number;
    totalVolumeKg: number;
    durationMinutes: number;
    exercisesCompleted: number;
  };
}
```

### `delete_workout_session`
Deleta sessão e todos os sets.

**Input:** `{ sessionId: string }`  
**Output:** `{ deleted: true }`

---

## Séries (sets) — força e cardio

> `SessionSet` cobre tanto séries de força (peso × reps) quanto entradas de cardio (duração × distância). O tipo é determinado pelo `muscleGroup` do `Exercise`. Service valida que campos corretos foram fornecidos.

### `log_set`
Registra uma série dentro de uma sessão ativa (ou já finalizada — útil pra correção tardia).

**Input — força:**
```typescript
{
  sessionId: string;
  exerciseId: number;
  setNumber?: number;     // default: próximo número disponível pra esse exercício na sessão
  weightKg: number;       // obrigatório se exercise é de força
  reps: number;           // obrigatório se exercise é de força
  rpe?: number;           // 1-10
  notes?: string;
}
```

**Input — cardio:**
```typescript
{
  sessionId: string;
  exerciseId: number;
  setNumber?: number;
  durationSeconds: number;     // obrigatório pra cardio
  distanceMeters?: number;     // opcional (esteira/bike registram, natação às vezes)
  avgHeartRate?: number;       // opcional
  kcalBurned?: number;         // opcional, se o aparelho mostrou
  notes?: string;
}
```

**Output:**
```typescript
{
  setId: string;
  setNumber: number;
  isPersonalRecord: boolean;   // PR de carga (força) ou PR de duração/distância (cardio)
}
```

**Erros:**
- `INVALID_INPUT` se exercise é de força e faltou `weightKg` ou `reps`
- `INVALID_INPUT` se exercise é cardio e faltou `durationSeconds`
- `INVALID_INPUT` se misturou campos de força e cardio na mesma chamada

### `update_set`
**Input:**
```typescript
{
  setId: string;
  // Campos de força (mantém compatibilidade)
  weightKg?: number;
  reps?: number;
  rpe?: number;
  // Campos de cardio
  durationSeconds?: number;
  distanceMeters?: number;
  avgHeartRate?: number;
  kcalBurned?: number;
  // Comuns
  notes?: string;
  setNumber?: number;
}
```

### `delete_set`
**Input:** `{ setId: string }`

### `get_last_set_for_exercise`
Última série logada para um exercício, em qualquer sessão.

**Input:**
```typescript
{
  exerciseId: number;
  beforeDate?: string;
}
```

**Output:**
```typescript
{
  set: {
    // Campos preenchidos conforme tipo do exercício
    weightKg: number | null;
    reps: number | null;
    rpe: number | null;
    durationSeconds: number | null;
    distanceMeters: number | null;
    avgHeartRate: number | null;
    kcalBurned: number | null;
    loggedAt: string;
    sessionId: string;
  } | null;
}
```

### `get_personal_record`
Recorde pessoal de um exercício. Métrica varia conforme tipo.

**Input:**
```typescript
{
  exerciseId: number;
  // Para força: "weight" | "volume" | "1rm_estimate"  (default "weight")
  // Para cardio: "longest_duration" | "longest_distance" | "fastest_pace"  (default "longest_duration")
  metric?: string;
}
```

**Output (força):**
```typescript
{
  pr: {
    type: "strength";
    weightKg: number;
    reps: number;
    estimated1RM: number;
    achievedAt: string;
    sessionId: string;
  } | null;
}
```

**Output (cardio):**
```typescript
{
  pr: {
    type: "cardio";
    durationSeconds: number;
    distanceMeters: number | null;
    paceSecondsPerKm: number | null;   // calculado quando distance + duration disponíveis
    achievedAt: string;
    sessionId: string;
  } | null;
}
```

---

## Peso corporal

### `log_weight`
**Input:**
```typescript
{
  weightKg: number;
  loggedAt?: string;     // default: now (geralmente manhã)
  notes?: string;
}
```

**Output:** `{ weightLogId: string }`

### `update_weight_log`
**Input:**
```typescript
{
  weightLogId: string;
  weightKg?: number;
  loggedAt?: string;
  notes?: string;
}
```

### `delete_weight_log`
**Input:** `{ weightLogId: string }`

### `list_weight_logs`
**Input:**
```typescript
{
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}
```

**Output:**
```typescript
{
  logs: Array<{
    id: string;
    weightKg: number;
    loggedAt: string;
    notes: string | null;
  }>;
  nextCursor?: string;
}
```

---

## Passos

> Múltiplos logs por dia são permitidos. Isso é deliberado — abre caminho pra integrações futuras (Google Fit, Health Connect, etc) sem migration breaking. Para "passos do dia X", o servidor retorna o **maior valor** entre os logs daquele dia, com fallback no mais recente em caso de empate. Comportamento documentado em `getStepsForDate` no service.

### `log_steps`
Registra uma contagem de passos para um dia. Pode ser chamada múltiplas vezes — substitui não, adiciona um novo log. Caso de uso v1: usuário fala pro Claude no fim do dia "fiz 9500 passos hoje".

**Input:**
```typescript
{
  date?: string;        // ISO date YYYY-MM-DD; default: hoje no fuso do user
  steps: number;        // inteiro >= 0
  source?: "MANUAL" | "GOOGLE_FIT" | "APPLE_HEALTH" | "HEALTH_CONNECT"
         | "STRAVA" | "GARMIN" | "FITBIT" | "WEBHOOK";  // default MANUAL
  notes?: string;
}
```

**Output:**
```typescript
{
  stepLogId: string;
  effectiveStepsForDate: number;   // valor atual considerado "do dia" após esse log
  goalReached: boolean | null;     // null se sem dailyStepsTarget
}
```

### `update_step_log`
Corrige um log específico. Para sobrescrever o valor do dia, prefira `log_steps` com novo valor — múltiplos logs são esperados.

**Input:**
```typescript
{
  stepLogId: string;
  steps?: number;
  notes?: string;
  date?: string;       // raro, mas permitido pra corrigir lançamento em dia errado
}
```

### `delete_step_log`
**Input:** `{ stepLogId: string }`

### `list_step_logs`
Lista logs em um período. Útil pra auditoria/correção. Retorna **todos** os logs, não o efetivo por dia.

**Input:**
```typescript
{
  from?: string;       // ISO date
  to?: string;
  limit?: number;
  cursor?: string;
}
```

**Output:**
```typescript
{
  logs: Array<{
    id: string;
    date: string;
    steps: number;
    source: StepSource;
    loggedAt: string;
    notes: string | null;
  }>;
  nextCursor?: string;
}
```

### `get_steps_for_date`
Retorna o valor "efetivo" de passos para um dia específico (após resolução por política do servidor).

**Input:**
```typescript
{
  date?: string;       // default: hoje
}
```

**Output:**
```typescript
{
  date: string;
  steps: number;                       // valor efetivo (max dos logs do dia)
  goalReached: boolean | null;
  goalTarget: number | null;
  logCount: number;                    // quantos logs distintos compõem esse dia
  sources: StepSource[];               // fontes que enviaram dados nesse dia
}
```

### `get_steps_history`
Série temporal por dia, pra gráfico de progresso.

**Input:**
```typescript
{
  days: 7 | 14 | 30 | 90 | 180;
}
```

**Output:**
```typescript
{
  days: Array<{
    date: string;
    steps: number;        // 0 se nenhum log naquele dia
    goalReached: boolean | null;
  }>;
  averageDaily: number;
  daysWithGoalReached: number;
  totalDaysLogged: number;
}
```

---

## Progresso

### `get_weight_progress`
Série temporal de peso + médias semanais + delta.

**Input:**
```typescript
{
  days: 14 | 30 | 90 | 180 | 365;
}
```

**Output:**
```typescript
{
  points: Array<{ date: string; weightKg: number }>;
  weeklyAverages: Array<{ weekStart: string; avgKg: number; deltaKg: number | null }>;
  totalDeltaKg: number;          // peso final - peso inicial no período
  currentWeightKg: number | null;
}
```

### `get_strength_progress`
Evolução de carga em um exercício específico.

**Input:**
```typescript
{
  exerciseId: number;
  days: 30 | 90 | 180 | 365;
  metric?: "max_weight" | "estimated_1rm" | "total_volume";   // default max_weight
}
```

**Output:**
```typescript
{
  exercise: { id: number; name: string };
  metric: string;
  points: Array<{
    sessionDate: string;
    sessionId: string;
    value: number;             // o número da métrica escolhida
    bestSet: { weightKg: number; reps: number };
  }>;
  startValue: number | null;
  currentValue: number | null;
  deltaPercent: number | null;
}
```

### `get_volume_progress`
Volume de treino total (sum weight*reps) por semana, opcionalmente filtrado por grupo muscular. Considera apenas séries de força.

**Input:**
```typescript
{
  days: 30 | 90 | 180;
  muscleGroup?: string;
}
```

**Output:**
```typescript
{
  weeks: Array<{
    weekStart: string;
    totalVolumeKg: number;
    sessionCount: number;
  }>;
  averageWeeklyVolumeKg: number;
}
```

### `get_cardio_progress`
Evolução de cardio em um exercício específico (ex: esteira). Retorna métrica escolhida ao longo das sessões.

**Input:**
```typescript
{
  exerciseId: number;
  days: 30 | 90 | 180 | 365;
  metric?: "duration" | "distance" | "pace" | "kcal";   // default "duration"
}
```

**Output:**
```typescript
{
  exercise: { id: number; name: string };
  metric: string;
  points: Array<{
    sessionDate: string;
    sessionId: string;
    durationSeconds: number;
    distanceMeters: number | null;
    paceSecondsPerKm: number | null;
    kcalBurned: number | null;
    value: number;        // o valor da métrica escolhida pra facilitar o gráfico
  }>;
  bestSession: {
    sessionId: string;
    sessionDate: string;
    value: number;
  } | null;
}
```

### `get_steps_progress`
Wrapper de `get_steps_history` no formato consistente com as outras tools de progresso. Útil pra gráficos no PWA.

**Input:**
```typescript
{
  days: 14 | 30 | 90 | 180;
}
```

**Output:**
```typescript
{
  points: Array<{ date: string; steps: number; goalReached: boolean | null }>;
  weeklyAverages: Array<{ weekStart: string; avgSteps: number }>;
  totalSteps: number;
  averageDaily: number;
  bestDay: { date: string; steps: number } | null;
  goalTarget: number | null;
  daysWithGoalReached: number;
}
```

---

## Dashboard

### `get_today_summary`
Resumo agregado pro Claude responder "como estou hoje?".

**Input:** _(nenhum)_

**Output:**
```typescript
{
  date: string;
  nutrition: {
    consumed: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    goals: UserGoals | null;
    mealsLogged: number;
    onTrack: boolean | null;
  };
  workout: {
    plannedToday: { planId: string; name: string } | null;
    sessionInProgress: { sessionId: string; startedAt: string } | null;
    completedToday: boolean;
  };
  weight: {
    latest: { weightKg: number; loggedAt: string } | null;
    loggedToday: boolean;
  };
  steps: {
    today: number;
    target: number | null;
    goalReached: boolean | null;
    logged: boolean;            // se há ao menos um log hoje
  };
  streak: {
    nutritionDays: number;
    workoutWeeks: number;
    stepsDays: number;          // dias consecutivos batendo meta de passos
  };
}
```

### `get_week_summary`
Resumo da semana corrente.

**Input:** _(nenhum)_

**Output:**
```typescript
{
  weekStart: string;
  weekEnd: string;
  nutrition: {
    avgKcal: number;
    avgProteinG: number;
    daysOnTrack: number;
  };
  workouts: {
    completed: number;
    target: number;
    sessions: Array<{ date: string; planName: string | null; volumeKg: number }>;
  };
  cardio: {
    sessionCount: number;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
  };
  steps: {
    totalSteps: number;
    avgDaily: number;
    daysWithGoalReached: number;
    target: number | null;
  };
  weight: {
    startKg: number | null;
    currentKg: number | null;
    deltaKg: number | null;
  };
}
```

---

## Tools intencionalmente NÃO expostas

Documentadas pra deixar claro o que NÃO fazemos via MCP:

- **Criar usuários:** apenas admin via console do Logto. MCP não cria contas.
- **Mudar senha:** flow nativo do Logto, fora do nosso código.
- **Gerenciar sessões / tokens OAuth:** Logto gerencia. Usuário pode revogar sessões pelo console do Logto.
- **Promover usuário a admin:** apenas via console do Logto (atribuição de role).
- **Bulk import (massivo) de comidas/treinos:** se precisar, vira ADR e endpoint admin separado.
- **Acesso a dados de outros usuários:** mesmo admin não acessa via MCP.

---

## Fluxos completos (exemplos)

Estes exemplos ilustram como o Claude orquestra múltiplas tools para resolver pedidos do usuário em linguagem natural.

### Fluxo 1: "Comi 200g de frango grelhado e uma xícara de arroz no almoço"

```
1. search_food({ query: "frango grelhado", limit: 5 })
   → encontra Food#42 "Frango, peito, sem pele, grelhado"
2. search_food({ query: "arroz branco cozido", limit: 5 })
   → encontra Food#15 "Arroz, branco, cozido"
3. log_meal({
     mealType: "LUNCH",
     items: [
       { foodId: 42, grams: 200 },
       { foodId: 15, grams: 158 }   // 1 xícara ≈ 158g cozido
     ]
   })
   → mealId + totais calculados pelo servidor
4. (opcional) get_nutrition_summary() pra mostrar progresso do dia
```

### Fluxo 2: "Cria um plano Push pra mim"

```
1. create_workout_plan({ name: "Push" })
   → planId
2. search_exercise({ query: "supino", muscleGroup: "peito" })
3. add_exercise_to_plan({ planId, exerciseId, targetSets: 4, targetReps: "8-10" })
4. (repete pra ombro, tríceps)
5. get_workout_plan({ planId }) pra confirmar
```

### Fluxo 3: "Tô começando o treino de hoje"

```
1. get_today_summary()
   → vê plannedToday: { planId, name: "Pull" }
2. start_workout({ planId })
   → retorna prefilledExercises com last set de cada
3. (durante treino, pra cada série)
   log_set({ sessionId, exerciseId, weightKg: 80, reps: 10, rpe: 8 })
4. finish_workout({ sessionId })
   → resumo da sessão
```

### Fluxo 4: "Quanto eu progredi no supino nos últimos 3 meses?"

```
1. search_exercise({ query: "supino reto" })
   → exerciseId
2. get_strength_progress({ exerciseId, days: 90, metric: "max_weight" })
   → série + delta percentual
3. get_personal_record({ exerciseId })
   → PR atual
```

### Fluxo 5: "Esqueci de logar o jantar de ontem, era arroz com bife"

```
1. search_food x2
2. log_meal({
     mealType: "DINNER",
     eatenAt: "2026-05-05T20:30:00-03:00",   // ontem
     items: [...]
   })
```

### Fluxo 6: "Errei a quantidade do almoço, era 250g de frango não 200g"

```
1. list_meals({ date: "2026-05-06", mealType: "LUNCH" })
   → encontra mealId + itemId do frango
2. update_meal_item({ itemId, grams: 250 })
   → totais recalculados automaticamente
```

### Fluxo 7: "Fiz 30 min de esteira hoje, 5km"

```
1. search_exercise({ query: "esteira" })
   → exerciseId
2. start_workout({})           // sessão livre, sem plano
   → sessionId
3. log_set({
     sessionId,
     exerciseId,
     durationSeconds: 1800,
     distanceMeters: 5000
   })
4. finish_workout({ sessionId })
```

Alternativa quando o cardio é parte de um treino híbrido:

```
1. start_workout({ planId: "push" })   // plano de força normal
   → sessionId, prefilledExercises (peito, ombro, tríceps)
2. log_set({ sessionId, exerciseId: 12 /* supino */, weightKg: 80, reps: 10 })
   ... outras séries de força
3. log_set({                            // cardio no fim
     sessionId,
     exerciseId: 45 /* esteira */,
     durationSeconds: 600,
     distanceMeters: 1500
   })
4. finish_workout({ sessionId })
```

### Fluxo 8: "Andei 9500 passos hoje"

```
1. log_steps({ steps: 9500 })   // date default = hoje
   → goalReached: true (se target = 8000)
```

Correção: "ah, foi mais perto de 11000 na verdade, esqueci dos passos do mercado"

```
2. log_steps({ steps: 11000 })   // novo log; servidor pega o maior
   → effectiveStepsForDate: 11000
```

### Fluxo 9: "Como tá meu progresso de passos esse mês?"

```
1. get_steps_progress({ days: 30 })
   → série diária + média + dias batidos
2. (opcional) get_today_summary()
   → resumo completo incluindo streak de passos
```

---

## Versionamento

A v1 é `mcp.fatia.v1`. Mudanças breaking incrementam para `v2` em endpoint paralelo (`/mcp/v2`). Adições não-breaking não exigem versão nova — adicionamos a tool, documentamos aqui.

## Performance esperada

- Tool simples (CRUD único): < 50ms
- `get_today_summary`, `get_week_summary`: < 200ms
- `log_meal` com 5+ itens: < 100ms
- Histórico/progresso 90 dias: < 300ms

Tudo abaixo de 500ms p99 com índices definidos no schema.

## Rate limit

Por token:
- 60 req/min em tools de leitura
- 30 req/min em tools de escrita
- Burst de 10 req em 1s permitido

Excesso retorna `RATE_LIMITED` com `Retry-After`.

## Observabilidade

Cada chamada loga:
- Tool name
- userId (não o token)
- duration_ms
- success/error
- input size (não o conteúdo, por privacidade)

Sem PII em logs. Erros guardam stack trace, não o input.

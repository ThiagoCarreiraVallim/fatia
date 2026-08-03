# MCP Server — Especificação Completa de Tools

> **Princípio fundamental:** o Fatia é **MCP-first**. Toda funcionalidade disponível no PWA está disponível como tool MCP. O PWA é uma camada de visualização; o Claude é uma camada de ação tão capaz quanto. Se uma operação existe em um, existe no outro.

## Endpoint

```
https://api.fatia.dominio/mcp
```

Transport: **Streamable HTTP** (recomendação atual do MCP, suporta unidirecional e bidirecional).

## Autenticação

**Atualizado pela ADR 008.** O MCP do Fatia usa OAuth 2.1 conforme spec MCP, com identity provider externo (Logto self-hosted). Bearer tokens estáticos foram descontinuados.

> O fluxo ponta a ponta, o mapeamento exato de cada endpoint para o Logto, os env vars
> necessários e a decisão sobre revogação (RFC 7009) estão em
> [`docs/MCP_OAUTH.md`](./MCP_OAUTH.md).

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

### Anotações

Toda tool declara `title` (nome de exibição legível) e o hint aplicável. É requisito do
diretório de conectores da Anthropic, e é o que define quando o Claude pede confirmação
ao usuário antes de executar.

| Grupo         | Prefixos                                      | `readOnlyHint` | `destructiveHint` | Efeito no Claude   |
| ------------- | --------------------------------------------- | -------------- | ----------------- | ------------------ |
| Leitura       | `get_` `list_` `search_` `explain_` `export_` | `true`         | `false`           | roda sem confirmar |
| Destrutiva    | `delete_` + `remove_exercise_from_plan`       | `false`        | `true`            | sempre confirma    |
| Escrita comum | os demais                                     | `false`        | `false`           | roda sem confirmar |

⚠️ Os dois hints são declarados **sempre**, nunca omitidos. Dois motivos:

1. Na spec MCP, `destructiveHint` tem default `true` quando `readOnlyHint` é falso — omitir
   numa escrita comum faria o Claude pedir confirmação a cada refeição registrada.
2. O validador do portal de submissão exige `readOnlyHint` presente em toda tool, inclusive
   nas de escrita, onde o valor é `false`.

### Schemas de input não podem emitir `$ref`

Reusar a **mesma instância** de schema Zod em dois campos do mesmo input faz o conversor
deduplicar por identidade de objeto:

```json
"primaryMuscles":   { "type": "array", "items": { ... } },
"secondaryMuscles": { "$ref": "#/properties/primaryMuscles" }
```

É JSON Schema válido, mas cliente que não resolve `$ref` enxerga o campo **sem tipo** — o
portal de submissão reporta `Parameters missing type`. Quando um schema é compartilhado
entre campos, exponha-o como **fábrica** (`muscleListSchema()`), não como constante.

`remove_exercise_from_plan` é destrutiva apesar do prefixo: desfaz o vínculo e perde as
séries e repetições configuradas para aquele exercício no plano.

Isso é verificado por `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`, que falha se uma
tool declarar hint incoerente com o prefixo ou usar o próprio nome como título. `title`
ausente nem chega ao teste — não compila, porque `McpToolDef` o exige.

### Inferência hospedada

Toda tool declara também `hostedInference: boolean` — se a execução dispara inferência **paga
pela Fatia** (visão, LLM, embedding). Hoje as **101 tools** declaram `false`, e é a resposta que
pela Fatia** (visão, LLM, embedding). Hoje as **101 tools** declaram `false`, e é a resposta que
se quer manter.

O motivo é de custo, não de protocolo. Quem chama o `/mcp` é o modelo do usuário, na assinatura
dele: chamada MCP não passa por gateway de IA nosso, e custa **zero** de inferência à Fatia. Uma
tool que chame IA hospedada por dentro inverte isso em silêncio — o usuário pede pelo Claude
_dele_ e a conta cai aqui. Sem sintoma: a tool funciona, o log não muda, e o primeiro sinal é a
fatura.

Por isso o campo é **obrigatório** e não tem default: um default faria a tool cara nascer
classificada como grátis, que é justamente o caso a impedir. O mesmo spec acima reprova qualquer
tool que declare `true` sem estar na lista `HOSTED_INFERENCE_TOOLS` — vazia hoje, e acrescentar
um nome ali é declarar que a Fatia aceita pagar aquela chamada.

A política de quando isso é aceitável está na
[ADR 018](./ADR/018-inferencia-hospedada-fora-do-mcp.md): o default é **não expor** pelo MCP; a
forma aceita é o cliente trazer o resultado pronto, como `log_meal` já recebe macros calculados
pelo Claude (ADR 004).

O campo **não** vai no fio: ele fica fora de `annotations` de propósito — é política interna de
custo, não anotação da spec, e não tem por que gastar contexto do cliente. Há caso de teste
dedicado a impedir que ele volte para lá.

### Exemplo de invocação

Toda tool de **escrita** (`readOnlyHint: false`) termina a `description` com uma chamada
concreta — exceto `delete_my_account`, isenta pelo motivo listado abaixo. O `.describe()` de
campo já explica _aquele_ campo; o que faltava era mostrar o
**conjunto** de campos de uma chamada válida — o problema real de `log_set`, cujo schema é
plano com tudo opcional, mas que na prática aceita dois conjuntos disjuntos.

Formato, rígido de propósito para o teste conseguir extrair e validar:

```
Exemplo: {"json":"de uma linha só, no fim da description"}
```

```ts
readonly description =
  'Registra uma medição de peso corporal. ' +
  'Exemplo: {"weightKg":78.4,"loggedAt":"2026-07-29T07:10:00-03:00"}';
```

Regras:

- **Um exemplo por tool.** Dois só quando a tool aceita formas de chamada disjuntas — hoje
  `log_set` (força × cardio) e `log_meal` (item do catálogo × item livre). Nesse caso o
  prefixo leva um rótulo entre parênteses: `Exemplo (força):`, `Exemplo (cardio):`.
- **JSON de uma linha, com concatenação de strings.** Não é sobre parse — `JSON.parse`
  aceita `\n` sem reclamar. É sobre o que vai no fio: template literal multilinha embute a
  indentação do source dentro da description servida, gasta token à toa e deixa o exemplo à
  mercê de quem reflui ou trunca o texto do catálogo.
- **Só os campos que importam.** Obrigatórios sempre; opcionais apenas quando o campo é o
  ponto do exemplo (`loggedAt` em `log_weight`, `source` em `log_steps`).
- **IDs são fictícios e óbvios** (`11111111-2222-4333-8444-555555555555`). O exemplo mostra
  o formato do argumento, não um registro que existe — o ID real vem de um `search_`/`list_`.
- **Tool somente-leitura é isenta.** Input curto, raramente ambíguo, e o custo em token é
  cobrado em toda sessão.
- **`delete_my_account` é a única tool de escrita isenta.** O input é um literal único, já
  soletrado na própria description: o exemplo não acrescentaria informação, acrescentaria
  uma chamada completa e disparável — sem ID para buscar antes — encerrando a description
  num template pronto para colar, logo depois da frase que manda nunca chamar por iniciativa
  própria. As outras 13 destrutivas pedem um ID que o modelo não tem, e essa fricção é o
  ponto. Isenção declarada em `EXAMPLE_EXEMPT`, no guarda; nome que sair do catálogo derruba
  o teste, para a isenção não virar permissão órfã.

Verificado por `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`, que faz o `JSON.parse` e
roda o exemplo contra o `inputSchema` Zod da própria tool — em duas passadas: o schema
original valida tipo, enum, obrigatório e min/max; uma cópia com `.strict()` recursivo pega
chave que não existe mais, inclusive dentro de `items[]`. É essa segunda parte que importa:
exemplo que não passaria na validação **induz o modelo ao erro** e é pior que exemplo
nenhum — então ele não pode sobreviver calado a uma renomeação de campo.

A cópia recursiva trata `object`, `array`, `optional`, `nullable`, `default`, `effects`
(`.refine`/`.preprocess`) e `record`. **Qualquer outro container derruba o teste**, nomeando
o tipo e o caminho do campo. Devolver o schema intocado seria pior: um `union` ou um
`.default({})` num objeto aninhado desligaria a checagem de chave sem nenhum sinal, e
verificador que silencia é pior que verificador nenhum.

**Custo em token.** Medido no payload realmente servido pelo registry (`name`, `title`,
`description`, `annotations` e o JSON Schema do input das 101 tools): **72,9 k caracteres**
hoje, dos quais **4.336 são os exemplos** — acréscimo de **6,3%** sobre os 64,3 k de antes,
pago em toda sessão que lista as tools. Média de 89 caracteres por tool; os maiores são
`log_meal` (307) e `log_set` (268), que têm dois exemplos cada. Números registrados aqui
para que uma futura discussão de tamanho de catálogo parta do dado, e não da impressão —
atenção ao denominador: medir só `name + description + inputSchema` (60,8 k) subestima o
`description`, `annotations` e o JSON Schema do input das 101 tools): **76,4 k caracteres**
hoje, dos quais **4.499 são os exemplos** — acréscimo de **6,3%** sobre os 64,3 k de antes,
pago em toda sessão que lista as tools. Média de 89 caracteres por tool; os maiores são
`log_meal` (307) e `log_set` (268), que têm dois exemplos cada. Números registrados aqui
para que uma futura discussão de tamanho de catálogo parta do dado, e não da impressão —
atenção ao denominador: medir só `name + description + inputSchema` (63,7 k) subestima o
catálogo em ~20% e infla o percentual para ~7%.

A medição é refeita a cada rodada de `tool-catalog.spec.ts`, que compara estes números com o
catálogo real: a versão anterior desta linha afirmava 66,7 k e seguiu afirmando depois de duas
tools novas entrarem, porque nada a conferia.

### IDs

- IDs de entidades user-owned (`Meal`, `WorkoutSession`, etc): UUID string
- IDs de catálogos compartilhados (`Food`, `Exercise`, `FoodGroup`): integer
- Validação: tool retorna `NOT_FOUND` se ID não existe **ou** não pertence ao usuário (mesma resposta para não vazar info). Vale para leitura **e** escrita — devolver `403` só no segundo caso permitiria enumerar IDs alheios, o que era um furo real corrigido pela #92. Ver [`docs/THREAT_MODEL.md`](./THREAT_MODEL.md).
- Exceção deliberada: exercícios do **catálogo base** respondem `CONFLICT` com mensagem apontando `clone_exercise`. O catálogo base é público e igual para todos — não há existência a esconder, e a mensagem evita o cliente insistir num caminho impossível.

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

| Categoria                 | Tool                         | Operação |
| ------------------------- | ---------------------------- | -------- |
| **Perfil**                | `get_me`                     | R        |
|                           | `update_me`                  | U        |
|                           | `update_timezone`            | U        |
| **Conta (LGPD)**          | `export_my_data`             | R        |
|                           | `delete_my_account`          | D        |
| **Metas (macros)**        | `get_nutrition_goals`        | R        |
|                           | `set_nutrition_goals`        | C/U      |
| **Metas pessoais**        | `create_goal`                | C        |
|                           | `get_goal`                   | R        |
|                           | `list_goals`                 | R        |
|                           | `update_goal`                | U        |
|                           | `complete_goal`              | U        |
|                           | `delete_goal`                | D        |
| **Metas de nutrientes**   | `set_nutrient_target`        | C/U      |
|                           | `list_nutrient_targets`      | R        |
|                           | `delete_nutrient_target`     | D        |
|                           | `get_nutrient_summary`       | R        |
| **Alimentos (catálogo)**  | `search_food`                | R        |
|                           | `get_food`                   | R        |
|                           | `create_custom_food`         | C        |
|                           | `update_custom_food`         | U        |
|                           | `delete_custom_food`         | D        |
|                           | `list_food_groups`           | R        |
| **Refeições**             | `log_meal`                   | C        |
|                           | `get_meal`                   | R        |
|                           | `list_meals`                 | R        |
|                           | `update_meal`                | U        |
|                           | `delete_meal`                | D        |
| **Itens de refeição**     | `add_meal_item`              | C        |
|                           | `update_meal_item`           | U        |
|                           | `delete_meal_item`           | D        |
| **Resumo nutricional**    | `get_nutrition_summary`      | R        |
|                           | `get_nutrition_history`      | R        |
| **Exercícios (catálogo)** | `search_exercise`            | R        |
|                           | `list_exercises_by_muscle`   | R        |
|                           | `get_exercise_details`       | R        |
|                           | `explain_form`               | R        |
|                           | `create_custom_exercise`     | C        |
|                           | `clone_exercise`             | C        |
|                           | `update_custom_exercise`     | U        |
|                           | `delete_custom_exercise`     | D        |
| **Planos de treino**      | `create_workout_plan`        | C        |
|                           | `get_workout_plan`           | R        |
|                           | `list_workout_plans`         | R        |
|                           | `update_workout_plan`        | U        |
|                           | `delete_workout_plan`        | D        |
|                           | `add_exercise_to_plan`       | C        |
|                           | `update_plan_exercise`       | U        |
|                           | `remove_exercise_from_plan`  | D        |
|                           | `reorder_plan_exercises`     | U        |
| **Sessões de treino**     | `start_workout_session`      | C        |
|                           | `get_workout_session`        | R        |
|                           | `get_active_workout_session` | R        |
|                           | `list_workout_sessions`      | R        |
|                           | `update_workout_session`     | U        |
|                           | `finish_workout_session`     | U        |
|                           | `delete_workout_session`     | D        |
| **Séries**                | `log_set`                    | C        |
|                           | `update_set`                 | U        |
|                           | `delete_set`                 | D        |
|                           | `get_last_set_for_exercise`  | R        |
|                           | `get_personal_record`        | R        |
|                           | `list_personal_records`      | R        |
|                           | `get_load_prescription`      | R        |
| **Periodização**          | `create_training_block`      | C        |
|                           | `get_training_block`         | R        |
|                           | `delete_training_block`      | D        |
| **Peso corporal**         | `log_weight`                 | C        |
|                           | `update_weight_log`          | U        |
|                           | `delete_weight_log`          | D        |
|                           | `list_weight_logs`           | R        |
| **Passos**                | `log_steps`                  | C        |
|                           | `update_step_log`            | U        |
|                           | `delete_step_log`            | D        |
|                           | `list_step_logs`             | R        |
|                           | `get_steps_for_date`         | R        |
|                           | `get_steps_history`          | R        |
| **Hidratação**            | `log_water`                  | C        |
|                           | `update_water_log`           | U        |
|                           | `delete_water_log`           | D        |
|                           | `list_water_logs`            | R        |
|                           | `get_water_for_date`         | R        |
|                           | `get_water_history`          | R        |
|                           | `get_water_progress`         | R        |
| **Progresso**             | `get_weight_progress`        | R        |
|                           | `get_strength_progress`      | R        |
|                           | `get_volume_progress`        | R        |
|                           | `get_cardio_progress`        | R        |
|                           | `get_steps_progress`         | R        |
| **Dashboard**             | `get_today_summary`          | R        |
|                           | `get_week_summary`           | R        |
| **Engajamento**           | `get_streak`                 | R        |
|                           | `list_achievements`          | R        |
|                           | `refresh_achievements`       | W        |
| **Grupos (B2B)**          | `list_my_groups`             | R        |
|                           | `join_group`                 | C        |
|                           | `leave_group`                | D        |
| **Compartilhamento**      | `list_data_sharing`          | R        |
|                           | `grant_data_sharing`         | C/U      |
|                           | `revoke_data_sharing`        | U        |
|                           | `list_data_access_log`       | R        |

Total: **101 tools**. Cada uma documentada abaixo.
Total: **101 tools**. Cada uma documentada abaixo.

> Este catálogo é verificado automaticamente contra o código por
> `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`: adicionar, renomear ou remover uma tool sem
> atualizar esta doc quebra o CI. A revisão de consolidação da superfície está em
> [`docs/MCP_TOOL_SURFACE.md`](./MCP_TOOL_SURFACE.md).

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
  role: 'USER' | 'ADMIN';
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
{
  timezone: string;
} // ex: "America/Sao_Paulo"
```

**Output:** `{ timezone: string }`

---

## Conta e dados (LGPD)

Portabilidade e eliminação, expostos como tools para o usuário exercer os dois direitos
conversando com o Claude. Também disponíveis via REST: `GET /users/me/export` e
`DELETE /users/me`.

### `export_my_data`

Exporta **todos** os dados do usuário em JSON: perfil, metas (macros, nutrientes e pessoais),
refeições com itens, treinos com séries, peso, passos, hidratação, conquistas desbloqueadas, e
os alimentos e exercícios custom que ele criou.

O catálogo público (TACO e exercícios base) **não** vai no export: não é dado pessoal e
inflaria o payload sem informação sobre o usuário.

**Input:** `{}`

**Output:**

```typescript
{
  exportedAt: string;        // gerado no servidor
  format: 'fatia-export-v1';
  user: { id, email, name, role, timezone, heightCm, createdAt, updatedAt };
  nutritionGoals: UserGoals | null;
  nutrientTargets: NutrientTarget[];
  personalGoals: Goal[];
  meals: Array<Meal & { items: MealItem[] }>;
  customFoods: Food[];
  customExercises: Exercise[];
  workoutPlans: Array<WorkoutPlan & { exercises: [...] }>;
  workoutSessions: Array<WorkoutSession & { sets: [...] }>;
  weightLogs: WeightLog[];
  stepLogs: StepLog[];
  waterLogs: WaterLog[];
  // Inclui o `context` do desbloqueio (`first_pr` guarda exercício e carga), que é dado de
  // saúde e não existe em nenhuma outra tabela.
  achievements: UserAchievement[];
  counts: { meals: number; weightLogs: number; achievements: number; /* ... */ };
}
```

> `counts` existe para o cliente resumir ("você tem 412 refeições registradas") sem varrer o
> payload inteiro. `logtoSub` **não** é exportado — é identificador de infraestrutura de auth,
> não dado do usuário.

### `delete_my_account`

Apaga permanentemente a conta e **todos** os dados. Irreversível.

**Input:**

```typescript
{
  confirmation: 'DELETAR MINHA CONTA'; // exato, incluindo caixa
}
```

**Output:**

```typescript
{
  deleted: true;
  logtoIdentityDeleted: boolean;
  message: string;
}
```

**Erros:** `INVALID_INPUT` se a `confirmation` não for exata — é a trava contra deleção
acidental, e caixa e espaços importam.

> **Protocolo esperado do cliente:** confirmar em texto claro com o usuário, oferecer
> `export_my_data` antes, e só então chamar. A tool nunca deve ser disparada a partir de uma
> frase ambígua.
>
> A deleção no Postgres é garantida pelos `onDelete: Cascade` a partir de `User`. A identidade
> no Logto é apagada **antes** do registro local: se fosse depois e o Logto falhasse, a
> identidade órfã reprovisionaria uma conta vazia no próximo login em vez de mostrar um erro.
> Quando as credenciais da Management API do Logto não estão configuradas,
> `logtoIdentityDeleted` volta `false` — os dados locais são apagados normalmente e a
> identidade remanescente não dá acesso a nada.

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
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
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
    source: 'TACO' | 'USDA' | 'CUSTOM';
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
  }
}
```

**Idempotência.** A chave natural é `userId + eatenAt + mealType + itens` (conjunto de
alimento + gramas, ordem irrelevante; `notes` fora da chave). Reenviar a mesma refeição —
um retry depois de timeout, por exemplo — retorna `CONFLICT` citando o id da refeição já
existente, em vez de duplicar em silêncio.

Se o usuário realmente comeu a mesma coisa duas vezes, ajuste `eatenAt` para o horário da
segunda refeição.

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
  totals: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }
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
  mealTotals: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }
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
  mealTotals: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }
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
    metGoals: boolean | null; // true se ficou no range, null se sem metas
  }>;
  averages: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }
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

### `clone_exercise`

Cria (ou reaproveita) uma **cópia editável** de um exercício base. Exercícios do catálogo público são só-leitura; para personalizar um, o usuário precisa de uma cópia própria. Depois do clone, a base desaparece das listagens do usuário e a cópia a substitui.

Aceita overrides opcionais para já editar no mesmo passo, evitando um `clone_exercise` seguido de `update_custom_exercise`.

**Input:**

```typescript
{
  id: number;                      // exercício base a copiar
  name?: string;                   // default: nome do base
  muscleGroup?: string;            // pt: peito, costas, pernas, ombro, braço, core, cardio
  primaryMuscles?: string[];       // em inglês — são as chaves das cores do diagrama
  secondaryMuscles?: string[];     // em inglês
  equipment?: string;              // pt: barra, halteres, máquina, peso corporal
  level?: string;                  // beginner | intermediate | advanced
  mechanic?: string;               // compound | isolation
  instructions?: string[];
  youtubeVideoId?: string;
  youtubeVideoIdPt?: string;
}
```

**Output:** o exercício custom criado, com `clonedFromId` apontando para a base.

> **Idempotente:** se já existe uma cópia daquela base para o usuário, ela é reaproveitada em vez de duplicar.

### `get_exercise_details`

Detalhes completos de um exercício por ID: músculos primários/secundários, equipamento, nível, mecânica e passos de execução. Use quando já tiver o ID — para buscar por nome, use `search_exercise` ou `explain_form`.

**Input:** `{ exerciseId: number }`

### `explain_form`

Passos de execução e detalhes de técnica de um exercício buscado **por nome** (busca parcial). É a tool para "como faz agachamento?" ou "tô sentindo no lombar, minha forma tá certa?".

**Input:** `{ exerciseName: string }`

**Output:** exercício com `instructions[]` — o insumo para o Claude explicar a execução.

---

## Planos de treino

### `create_workout_plan`

Cria um plano vazio.

**Input:**

```typescript
{
  name: string; // "Push", "Pull A", "Leg Heavy"
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
    id: string; // id do PlanExercise (não do Exercise)
    exerciseId: number;
    exerciseName: string;
    muscleGroup: string;
    order: number;
    targetSets: number;
    targetReps: string; // "8-12", "5", "AMRAP"
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
    lastUsedAt: string | null; // quando foi a última sessão
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

Reordena numa transação só — mais previsível que ajustar `order` um a um por
`update_plan_exercise`, que deixa a lista num estado intermediário entre uma
escrita e a outra.

Grava `order` **exatamente nos ids enviados** e não toca em mais nada do plano.
Envie só quem mudou de posição: incluir quem ficou parado sobrescreve o `order`
que o app pode ter acabado de gravar. Mesmo contrato do
`workoutApi.reorderPlanExercises` que o PWA e o app nativo usam.

**Input:**

```typescript
{
  planId: string;
  exercises: Array<{
    id: string; // planExerciseId (não o exerciseId do catálogo)
    order: number; // nova posição
  }>;
}
```

**Output:** o `WorkoutPlan` completo, já reordenado (mesmo shape de
`get_workout_plan`).

---

## Sessões de treino

### `start_workout_session`

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

> **Decisão chave:** retornar `prefilledExercises` com `lastSet` no `start_workout_session` é o que torna a UX "mostrar previous" trivial. Cliente não precisa fazer N chamadas.

### `get_active_workout_session`

Retorna a sessão de treino ativa (iniciada e ainda não finalizada), se houver. É o atalho para "continuar de onde parei" sem precisar listar sessões e filtrar.

**Input:** `{}`  
**Output:** mesma forma de `get_workout_session`, ou `null` se não há sessão aberta.

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
  totalVolumeKg: number; // soma de weight*reps
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

Atualiza as notas de uma sessão, finalizada ou em andamento. Para corrigir séries use `update_set`.

**Input:**

```typescript
{
  sessionId: string;
  notes?: string;
}
```

### `finish_workout_session`

Marca sessão como concluída. Idempotente — chamar de novo só atualiza notes/completedAt.

**Input:**

```typescript
{
  sessionId: string;
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
  }
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
  isPersonalRecord: boolean; // PR de carga (força) ou PR de duração/distância (cardio)
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

### `list_personal_records`

Recorde pessoal de **todos** os exercícios já treinados, num só retorno. Use para "quais são meus PRs?" em vez de chamar `get_personal_record` N vezes.

Força: maior carga, reps na carga máxima e 1RM estimado. Cardio: maior distância e a duração dessa sessão. Cada entrada traz a data do recorde, a última vez treinado e o total de séries. Ordenado do recorde mais recente para o mais antigo.

**Input:** `{}`

### `get_load_prescription`

Sugere carga, repetições e descanso da próxima sessão de um exercício de **força**, a partir do
histórico do próprio usuário. Dupla progressão com autorregulação por RPE, determinística — sem
modelo, sem extrapolação de tendência.

**Input:**

```typescript
{
  exerciseId: number;
  targetReps?: string;   // faixa alvo do plano, "8-12" ou "5". Default: "8-12"
}
```

**Output:**

```typescript
{
  status: "ok";
  weightKg: number;
  reps: number;
  restSeconds: number;
  basis: "rpe" | "reps";                                  // qual sinal decidiu
  action: "increase_load" | "increase_reps" | "hold";
  capped: boolean;                                        // algum teto cortou o salto
}
| { status: "insufficient_history" }                      // menos de 2 sessões concluídas
| { status: "cardio_exercise" }                           // cardio não tem prescrição de carga
```

A regra, em uma frase: parte da melhor série da última sessão **concluída** (maior 1RM estimado) e
sobe carga só quando as repetições fecharam o topo da faixa **e** o esforço permitiu. A sessão em
andamento fica de fora: a primeira série leve do dia — aquecimento, back-off, retomada — não pode
virar a base da sugestão no meio do próprio treino.

| Sinal da última sessão concluída        | Ação                                                      |
| --------------------------------------- | --------------------------------------------------------- |
| RPE médio ≤ 7 e reps no topo da faixa   | sobe a carga, reps voltam ao piso                         |
| RPE médio entre 7 e 9                   | mantém a carga, sobe uma repetição                        |
| RPE médio ≥ 9                           | repete carga e repetições                                 |
| Nenhum RPE registrado (`basis: "reps"`) | dupla progressão pura: topo em **todas** as séries → sobe |

Três tetos, todos verificados por teste:

1. **Por sessão:** o salto nunca passa de 5% da carga base (nem do passo fixo — 2,5 kg em
   composto, 1,25 kg em isolamento, arredondado para baixo em múltiplos de 0,5 kg), com piso de
   uma anilha: abaixo de 10 kg os 5% valem menos que 0,5 kg e o teto travaria a progressão.
2. **Por semana:** a carga não passa de 10% sobre a sessão mais antiga dentro de 7 dias da
   última. Estourou, devolve a carga anterior com `capped: true`.
3. **Absoluto:** não acrescenta carga acima de 1,05 × o recorde de todos os tempos.

Os tetos 2 e 3 são percentuais e não valem sobre zero: barra fixa e paralela são registradas com
carga 0, e 10% de 0 (ou 1,05 × recorde 0) prenderia esses exercícios em 0 kg para sempre.

`status: "insufficient_history"` é resposta, não erro: com menos de duas sessões **concluídas**
registradas **não invente uma carga**. Sugerir o recorde pessoal na série de abertura é exatamente o bug #190.

Exercício clonado (`clonedFromId`) herda o histórico do exercício de origem — renomear um
exercício não apaga a progressão.

---

## Periodização

Bloco de 4 semanas sobre a prescrição de carga: 3 de acúmulo/pico e 1 de deload. Os fatores de cada
semana **multiplicam** o `weightKg` e o volume que o `get_load_prescription` devolve — o bloco nunca
prescreve carga absoluta, para os tetos daquela regra continuarem valendo aqui dentro.

| Semana | Foco    | `intensityFactor` | `volumeFactor` |
| ------ | ------- | ----------------- | -------------- |
| 1      | acúmulo | 1,00              | 1,0            |
| 2      | acúmulo | 1,025             | 1,2            |
| 3      | pico    | 1,05              | 1,0            |
| 4      | deload  | 0,85              | 0,5            |

O que o banco guarda é a **intenção** (as 4 linhas acima, congeladas na criação); o andamento —
semana corrente, sessões feitas, reancoragem por falta — é recalculado a cada leitura a partir das
sessões concluídas. A decisão inteira está na
[ADR 019](./ADR/019-periodizacao-intencao-materializada-andamento-derivado.md).

### `create_training_block`

Monta o bloco ancorado numa segunda-feira **no fuso do usuário**: a de hoje quando hoje é segunda, a
próxima nos outros dias. Bloco montado numa quinta que começasse na segunda que já passou nasceria
com a semana 1 quase vencida, e a leitura da segunda seguinte já a daria por perdida — gastando uma
das três faltas que encerram o bloco com uma semana que terminou antes de ele existir.

**Input:**

```typescript
{
  planId?: string;                          // plano periodizado. Ausente = treino livre
  kind?: "strength" | "hypertrophy";        // 4-6 reps × 8-12 reps. Default: hypertrophy
  sessionsPerWeek?: number;                 // 1..7. Ausente = a meta semanal já cadastrada
}
```

**Output:** o mesmo objeto de `get_training_block`.

Só existe **um bloco ativo por vez**: com um em andamento a chamada responde `409`. Um bloco que a
reconciliação já dá por vencido é fechado automaticamente aqui — é a única hora em que o
fechamento é gravado, porque a leitura é somente-leitura de verdade.

### `get_training_block`

**Input:** `{}`

**Output:**

```typescript
{
  id: string;
  planId: string | null;
  planName: string | null;
  kind: "strength" | "hypertrophy";
  kindLabel: string;                        // "força" | "hipertrofia"
  repRange: string;                         // "4-6" | "8-12"
  startDate: string;                        // YYYY-MM-DD, segunda-feira
  weeksTotal: number;
  status: "active" | "completed" | "abandoned";
  currentWeek: BlockWeek | null;
  nextWeek: BlockWeek | null;
  weeks: BlockWeek[];
  deload:
    | { suggested: true; rpeDelta: number; loadDeltaKg: number }
    | { suggested: false; reason: "insufficient_history" | "rpe_not_rising" | "load_rising" };
  explanation: string;                      // a frase pronta para a tela
}
| null                                      // sem bloco ativo — não invente uma semana
```

`BlockWeek`:

```typescript
{
  weekNumber: number;
  focus: "accumulation" | "peak" | "deload";
  intensityFactor: number;
  volumeFactor: number;
  weekStart: string;                        // segunda-feira PLANEJADA
  effectiveWeekStart: string;               // onde a semana caiu depois das reancoragens
  effectiveWeekEnd: string;
  sessionsTarget: number;
  sessionsDone: number;
  shiftedWeeks: number;                     // vezes que ESTA semana foi perdida e reancorada
  state: "done" | "partial" | "current" | "upcoming" | "missed";
  summary?: string;                         // só em `currentWeek` e `nextWeek`
}
```

Ajuste quando o usuário sai do plano — o caso comum, não a exceção:

| Semana com a janela encerrada | O que acontece                                                        |
| ----------------------------- | --------------------------------------------------------------------- |
| Meta atingida                 | fecha e avança                                                        |
| Alguma sessão, abaixo da meta | fecha e avança com o déficit registrado — **não** empurra o bloco     |
| Nenhuma sessão                | ela e as seguintes andam 7 dias; a semana 2 continua sendo a semana 2 |
| 3 seguidas sem nenhuma        | bloco abandonado, e some da resposta                                  |

Só sessão **concluída** conta, pelo mesmo motivo do `get_load_prescription`: a semana não pode
fechar no meio do treino de sábado.

O deload também é antecipado por sinal real, e exige **as duas** condições juntas — RPE médio subindo
≥1 ponto em 3 sessões **e** carga igual ou menor. RPE subindo com carga subindo é progresso, não
fadiga. O sinal troca a semana que sinalizou com a de deload já existente; nunca cria uma quinta
semana. Sessão sem RPE preenchido é **pulada**, não conta como RPE zero — por isso a busca traz mais
candidatas do que o tamanho da janela. A antecipação é procurada desde a semana 1 a cada leitura, e
não só na semana corrente: como a janela de cada semana é congelada no início dela, a semana que
ficou com o deload continua sendo a mesma nas leituras seguintes, em vez de o deload voltar para a
semana 4 e a pessoa fazer dois em quatro semanas.

### `delete_training_block`

**Input:** `{ blockId: string }`

**Output:** `{ ok: true }`

Encerra o bloco e libera a criação do próximo. Nenhum treino é apagado.

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
  effectiveStepsForDate: number; // valor atual considerado "do dia" após esse log
  goalReached: boolean | null; // null se sem dailyStepsTarget
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
    steps: number; // 0 se nenhum log naquele dia
    goalReached: boolean | null;
  }>;
  averageDaily: number;
  daysWithGoalReached: number;
  totalDaysLogged: number;
}
```

---

## Hidratação

Vários logs por dia são o caso normal — cada copo ou garrafa é um log. A política do "valor do dia" é **soma**, ao contrário de `StepLog`, onde é o **maior** valor do dia (ADR 007).

### `log_water`

Registra consumo de água em mL.

**Input:**

```typescript
{
  ml: number;          // 250 = copo, 500 = garrafa
  date?: string;       // YYYY-MM-DD; default hoje no fuso do usuário
  notes?: string;
}
```

### `update_water_log`

Corrige um log existente.

**Input:** `{ id: string; ml?: number; date?: string; notes?: string }`

### `delete_water_log`

**Input:** `{ id: string }`

### `list_water_logs`

Lista os logs individuais, paginados (cursor).

**Input:** `{ from?: string; to?: string; limit?: number; cursor?: string }`

### `get_water_for_date`

Total consumido num dia — a **soma** de todos os logs daquele dia.

**Input:** `{ date?: string }` — default hoje no fuso do usuário.

### `get_water_history`

Histórico diário, preenchendo com `0` os dias sem log (não omite dias).

**Input:** `{ days: number }` — máx 365.

### `get_water_progress`

Estatísticas de hidratação: série diária, média, melhor dia e quantos dias bateram a meta (`UserGoals.dailyWaterTargetMl`).

**Input:** `{ days?: number }` — default 30, máx 365.

---

## Metas pessoais

Metas dinâmicas definidas pelo usuário, distintas de `get_nutrition_goals`/`set_nutrition_goals` (que cobrem apenas macros).

`currentValue` é derivado na leitura quando o `kind` tem fonte automática (`weight`, `workout_frequency`, `step_count`). Para `body_fat` e `custom` não há fonte — o valor vem de `lastReportedValue`, que o Claude atualiza via `update_goal`.

### `create_goal`

**Input:**

```typescript
{
  kind: "weight" | "body_fat" | "workout_frequency" | "step_count" | "custom";
  title: string;
  description?: string;
  startValue?: number;          // derivado do estado atual quando o kind tem fonte
  targetValue: number;
  unit: string;                 // "kg", "%", "treinos/semana", "passos"
  deadline?: string;            // ISO datetime
  lastReportedValue?: number;   // para kind=body_fat ou custom
}
```

### `get_goal`

Uma meta por ID, com progresso calculado.

**Input:** `{ goalId: string }`

### `list_goals`

Metas do usuário com progresso calculado.

**Input:** `{ status?: "active" | "completed" | "expired" | "archived"; kind?: GoalKind }`

### `update_goal`

Use `lastReportedValue` para reportar progresso manual em metas `body_fat` ou `custom`.

**Input:**

```typescript
{
  goalId: string;
  title?: string;
  description?: string;
  targetValue?: number;
  unit?: string;
  deadline?: string;            // vazio para remover
  lastReportedValue?: number;
  status?: GoalStatus;
}
```

### `complete_goal`

Atalho para marcar como concluída, em vez de `update_goal({ status: "completed" })`.

**Input:** `{ goalId: string }`

### `delete_goal`

Remove permanentemente.

**Input:** `{ goalId: string }`

---

## Metas de nutrientes

Metas de micronutrientes personalizadas (limitar sódio, açúcar; atingir fibra). Distintas de `set_nutrition_goals`, que cobre os macros fixos. O valor do dia é agregado de `MealItem.nutrients[nutrientKey]` — ver ADR 009.

### `set_nutrient_target`

Upsert por `nutrientKey`. Informe `max` para limite, `min` para meta mínima, ou os dois para uma faixa.

**Input:**

```typescript
{
  nutrientKey: string;   // "sodium_mg", "sugar_g", "fiber_g", "caffeine_mg"
  label: string;         // "Sódio"
  unit: string;          // "mg", "g"
  min?: number;
  max?: number;
  period?: "daily";      // v1: só daily
}
```

### `list_nutrient_targets`

**Input:** `{}`

### `delete_nutrient_target`

**Input:** `{ nutrientKey: string }`

### `get_nutrient_summary`

Resumo do dia contra as metas: total consumido por nutriente e status `under` / `ok` / `over` em relação a min/max.

**Input:** `{ date: string }` — YYYY-MM-DD.

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
  totalDeltaKg: number; // peso final - peso inicial no período
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
  exercise: {
    id: number;
    name: string;
  }
  metric: string;
  points: Array<{
    sessionDate: string;
    sessionId: string;
    value: number; // o número da métrica escolhida
    bestSet: { weightKg: number; reps: number };
  }>;
  startValue: number | null;
  currentValue: number | null;
  deltaPercent: number | null;
}
```

### `get_volume_progress`

Volume de treino total (sum weight\*reps) por semana, opcionalmente filtrado por grupo muscular. Considera apenas séries de força.

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
  streak: StreakSummary;        // ver `get_streak`
  achievements: Achievement[];  // ver `list_achievements`; só LIDAS aqui
}
```

Esta tool **não desbloqueia** nada: ela declara `readOnlyHint: true`, o Claude a chama sem
confirmar, e uma pergunta como "quanto comi hoje?" não pode gravar em `UserAchievement`. As
conquistas vêm no estado em que estão. Quem desbloqueia é `refresh_achievements`.

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
  }
  workouts: {
    completed: number;
    target: number;
    sessions: Array<{ date: string; planName: string | null; volumeKg: number }>;
  }
  cardio: {
    sessionCount: number;
    totalDurationSeconds: number;
    totalDistanceMeters: number;
  }
  steps: {
    totalSteps: number;
    avgDaily: number;
    daysWithGoalReached: number;
    target: number | null;
  }
  weight: {
    startKg: number | null;
    currentKg: number | null;
    deltaKg: number | null;
  }
}
```

---

## Engajamento

### `get_streak`

Sequência atual do usuário, com a regra de tolerância a falha (issue #147). Serve para o Claude
dizer "você está no seu 12º dia" sem carregar o dashboard inteiro.

**Input:** _(nenhum)_

**Output:**

```typescript
{
  // Dia ativo = pelo menos uma refeição registrada OU uma sessão concluída OU a meta de
  // passos batida. É o número grande da tela.
  activeDays: StreakResult;
  nutritionDays: StreakResult;
  workoutWeeks: StreakResult; // em SEMANAS, não em dias
  stepsDays: StreakResult;
  stepsTargetSet: boolean; // false = sem `UserGoals`; passos ficam fora do dia ativo
}

type StreakResult = {
  periodos: number; // tamanho, contando as faltas toleradas do meio
  faltasUsadas: number;
  faltasPermitidas: number;
  periodoCorrenteEmAberto: boolean; // hoje ainda sem registro, mas o dia não acabou
  janelaEsgotada: boolean; // encostou no teto varrido (365 dias / 53 semanas)
};
```

**Tolerância:** a sequência começa com uma falta liberada e ganha mais uma a cada 7 períodos
ativos, saturando em duas. Ela quebra na **segunda falta consecutiva** ou quando o orçamento
acaba. Um dia perdido não zera meses de trabalho — streak que pune desproporcionalmente faz o
usuário desistir de vez em vez de voltar.

### `list_achievements`

Catálogo de conquistas. Devolve as **sete** chaves sempre, desbloqueadas ou não, para o Claude
saber o que sugerir como próximo passo.

**Input:** _(nenhum)_

**Output:**

```typescript
Array<{
  key: string; // first_meal | first_workout | plan_created | first_pr
  // | first_full_week | streak_7 | streak_30
  title: string;
  description: string;
  unlockedAt: string | null; // ISO da data do EVENTO, não a de quando o app percebeu
  context: unknown; // { weightKg, exerciseName } em first_pr, por exemplo
}>;
```

Só lê (`readOnlyHint: true`). Quem desbloqueia é `refresh_achievements`.

### `refresh_achievements`

Reavalia o catálogo e **grava** as conquistas que passaram a valer. É a única tool que escreve em
`UserAchievement`, e por isso a única do grupo de engajamento anotada como escrita
(`readOnlyHint: false`).

Chamar depois de registrar refeição, treino ou plano é o que faz a conquista aparecer. É
idempotente: o `@@unique([userId, key])` garante que reavaliar não duplica nem reescreve o
`unlockedAt` de quem já tinha, então não há custo em chamar a cada abertura do app.

**Input:** _(nenhum)_

**Output:** o mesmo array de `list_achievements`, já com os desbloqueios desta chamada.

## Grupos (B2B)

Academia, personal e nutricionista entram pela [ADR 014](./ADR/014-compartilhamento-b2b-copia-e-vinculo.md).
Três coisas valem para todas as tools desta seção:

1. **Estar num grupo não concede nada.** Quem lê dado de saúde do usuário é o profissional que
   ele autorizou explicitamente, num ato separado (`ProfessionalLink`, #155). Não existe
   "acesso da academia".
2. **Ninguém coloca outra pessoa num grupo.** A identidade de quem entra sai sempre do token —
   nenhuma tool aceita id de usuário.
3. **Sair revoga na hora.** A saída encerra, na mesma transação, todo vínculo daquele grupo.

Criar grupo, aprovar entrada e remover membro **não têm tool**: são só REST, no painel do dono.
Ver [`docs/MCP_TOOL_SURFACE.md`](./MCP_TOOL_SURFACE.md).

### `list_my_groups`

Lista os grupos de que o usuário participa, com o papel dele e a situação da associação.

**Input:** _(nenhum)_

**Output:**

```typescript
Array<{
  id: string;
  type: 'SPONSORED' | 'SOCIAL';
  name: string;
  slug: string;
  role: 'OWNER' | 'PROFESSIONAL' | 'CREATOR' | 'MEMBER';
  status: 'INVITED' | 'ACTIVE';
  membershipId: string;
  joinedAt: string | null;
  createdAt: string;
}>;
```

### `join_group`

Pede para entrar num grupo pelo slug do convite. O pedido nasce `INVITED` e só vira `ACTIVE`
quando o dono aprova — o papel também é dele, porque `PROFESSIONAL` é papel que pode receber
consentimento de leitura e não pode ser autoatribuído.

**Input:**

```typescript
{
  slug: string;
}
```

**Erros:** `NOT_FOUND` se o slug não existe; `CONFLICT` se já é membro ou já existe pedido
pendente.

### `leave_group`

Sai do grupo. Não passa pelo dono, e nenhum papel pode impedir. Revoga todo `ProfessionalLink`
daquele grupo na mesma transação, com `revokedAt` datado e `revokedReason: "left_group"` — as
linhas continuam no banco, porque são elas que respondem "quem teve acesso a quê, quando".

**Input:**

```typescript
{
  groupId: string;
}
```

**Output:**

```typescript
{
  membershipId: string;
  groupId: string;
  status: 'LEFT';
  role: string;
  /** Vínculos revogados pela saída. Zero é resultado normal. */
  revokedLinks: number;
}
```

**Erros:** `NOT_FOUND` se não é membro do grupo; `CONFLICT` se é o dono — grupo sem dono fica
órfão com cobrança viva, então o caminho é transferir a propriedade ou apagar o grupo.

## Compartilhamento de dados (consentimento)

O que a #155 entrega para o usuário é a resposta a duas perguntas, pelo Claude: **"o que a
academia consegue ver de mim?"** e **"quem olhou meu dado?"**. Quatro regras valem para as
quatro tools desta seção:

1. **Consentimento é por profissional e por categoria**, nunca por grupo. Quem tem nutricionista
   e personal na mesma academia autoriza alimentação a um sem autorizar ao outro.
2. **O padrão é nada.** Não existe estado "compartilhado por omissão": sem uma autorização
   explícita não há linha, e sem linha não há leitura.
3. **Não existe "compartilhar tudo".** Um atalho que marcasse as cinco categorias de uma vez
   recriaria o tudo-ou-nada que estas tools existem para evitar. Confirme categoria por
   categoria com o usuário.
4. **Só o titular autoriza.** Nenhum papel de grupo — nem o dono da academia — consente pelo
   aluno. A identidade de quem autoriza sai do token.

As categorias (`ShareScope`) são independentes entre si e nenhuma implica outra:

| Escopo      | O que abre                         |
| ----------- | ---------------------------------- |
| `WORKOUT`   | Planos, sessões e séries de treino |
| `NUTRITION` | Refeições, itens e metas de macros |
| `BODY`      | Peso e medidas corporais           |
| `HABITS`    | Água e passos                      |
| `GOALS`     | Metas pessoais                     |

A matriz completa de papéis está em [`docs/PERMISSIONS.md`](./PERMISSIONS.md).

### `list_data_sharing`

Quem está autorizado a ver o quê, agora. Lista vazia significa que ninguém tem acesso — o estado
inicial de toda conta.

**Input:** _(nenhum)_

**Output:**

```typescript
Array<{
  linkId: string; // usado por revoke_data_sharing
  groupId: string;
  groupName: string;
  professionalMembershipId: string; // usado por grant_data_sharing
  professionalName: string;
  scopes: Array<'WORKOUT' | 'NUTRITION' | 'BODY' | 'HABITS' | 'GOALS'>;
  grantedAt: string;
}>;
```

### `grant_data_sharing`

Autoriza **um** profissional a ler categorias específicas. A lista enviada **substitui** a
anterior daquele profissional: enviar `["WORKOUT"]` para quem já tinha `["WORKOUT","NUTRITION"]`
tira a nutrição. Enviar `[]` equivale a revogar.

Substituir cria uma **linha nova** e marca a anterior com `revokedAt` e
`revokedReason: "superseded"` — a janela de vigência do que valia antes continua legível.

**Input:**

```typescript
{
  /** A associação DO PROFISSIONAL no grupo — nunca o id de usuário dele. */
  professionalMembershipId: string;
  scopes: Array<'WORKOUT' | 'NUTRITION' | 'BODY' | 'HABITS' | 'GOALS'>;
}
```

**Erros:** `NOT_FOUND` se a associação não existe **ou** se o usuário não faz parte daquele grupo
— a mesma resposta nos dois casos, senão a tool viraria oráculo de composição de grupo alheio;
`CONFLICT` se o alvo não é um `PROFESSIONAL` ativo (dono, criador de conteúdo e outros alunos não
podem receber acesso) ou se o usuário tentou autorizar a si mesmo.

### `revoke_data_sharing`

Corta o acesso de um profissional, em todas as categorias de uma vez. Vale a partir da próxima
requisição dele — a checagem acontece no início de cada requisição, então uma leitura já em voo
não é cancelada. A janela é de **uma** requisição.

A linha **não** é apagada: `revokedAt` é preenchido, e é ele que responde depois "quem teve
acesso a quê, quando".

Anotada com `destructiveHint: false` mesmo sendo escrita, e é decisão: revogar é o lado seguro
desta gangorra, e pedir confirmação para cortar acesso poria fricção justamente no controle que o
titular exerce sobre o próprio dado.

**Input:**

```typescript
{
  linkId: string; // de list_data_sharing
}
```

**Erros:** `NOT_FOUND` se o vínculo não existe, já está revogado, ou é de outra pessoa — a mesma
resposta nos três casos.

### `list_data_access_log`

"Quem olhou meu dado, quando." Uma linha por leitura, **incluindo as tentativas barradas** —
`denied: true` é o registro que denuncia sondagem do que não foi consentido, e é justamente o que
sumiria se a trilha fosse escrita só no caminho feliz.

A trilha registra **que** houve leitura, nunca o conteúdo lido: guardar o conteúdo criaria uma
segunda cópia do dado de saúde dentro da tabela cujo propósito é protegê-lo.

**Input:**

```typescript
{
  limit?: number; // 1..200, padrão 50, da mais recente para a mais antiga
}
```

**Output:**

```typescript
Array<{
  at: string;
  action: string; // "list_workout_sessions", "get_student_progress"
  scope: 'WORKOUT' | 'NUTRITION' | 'BODY' | 'HABITS' | 'GOALS';
  denied: boolean;
  /** null quando a conta do profissional já não existe — a trilha sobrevive a ele. */
  professionalName: string | null;
}>;
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
- **Criar grupo, aprovar entrada e remover membro (#154):** só REST. Painel de dono é superfície
  B2B, não é o app do usuário — nenhuma tool passa a poder criar grupo ou colocar alguém dentro
  de um. As tools de grupo são as três do lado do aluno.

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
2. start_workout_session({ planId })
   → retorna prefilledExercises com last set de cada
3. (durante treino, pra cada série)
   log_set({ sessionId, exerciseId, weightKg: 80, reps: 10, rpe: 8 })
4. finish_workout_session({ sessionId })
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
2. start_workout_session({})           // sessão livre, sem plano
   → sessionId
3. log_set({
     sessionId,
     exerciseId,
     durationSeconds: 1800,
     distanceMeters: 5000
   })
4. finish_workout_session({ sessionId })
```

Alternativa quando o cardio é parte de um treino híbrido:

```
1. start_workout_session({ planId: "push" })   // plano de força normal
   → sessionId, prefilledExercises (peito, ombro, tríceps)
2. log_set({ sessionId, exerciseId: 12 /* supino */, weightKg: 80, reps: 10 })
   ... outras séries de força
3. log_set({                            // cardio no fim
     sessionId,
     exerciseId: 45 /* esteira */,
     durationSeconds: 600,
     distanceMeters: 1500
   })
4. finish_workout_session({ sessionId })
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

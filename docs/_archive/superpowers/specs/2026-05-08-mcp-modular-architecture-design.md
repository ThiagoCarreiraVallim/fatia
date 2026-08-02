# MCP Modular Architecture — Design

## Contexto

Hoje todas as tools do MCP estão registradas em `apps/api/src/mcp/mcp-tools.registry.ts` (339 linhas). Adicionar uma tool nova exige editar esse arquivo central; o acoplamento entre o módulo `mcp/` e os services de domínio (`nutrition/*`) cresce a cada tool. Com Fase 2 (workout) e Fase 3 (progress) chegando, esse padrão não escala.

## Objetivos

- **Uma tool por arquivo**, junto do domínio dono (`nutrition/mcp/*.tool.ts`, `workout/mcp/*.tool.ts`, …).
- **Auto-registro** via decorator `@McpTool()` + `DiscoveryService` do Nest. Adicionar uma tool nova nunca exige editar arquivo central.
- **Coesão por domínio**: cada `*.Module` declara suas próprias tools como providers. O `McpModule` só importa os módulos de domínio.

## Não-escopo

Mantidos para uma evolução futura sobre essa base:

- Logging estruturado por tool (name, userId, duration, success).
- Rate limit por token via `@nestjs/throttler` customizado.
- Tipagem ponta-a-ponta sem `any` (o `defineTool` atual usa `any` por causa do SDK; resolver depois).

## Componentes

### `apps/api/src/mcp/tool.decorator.ts` (novo)

Define o decorator e a interface que toda tool implementa.

```ts
import 'reflect-metadata';
import type { ZodRawShape, z } from 'zod';

export interface McpToolContext {
  userId: string;
}

export interface McpToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  execute(input: z.infer<z.ZodObject<S>>, ctx: McpToolContext): Promise<unknown>;
}

export const MCP_TOOL_METADATA = 'mcp:tool';
export const McpTool = (): ClassDecorator => (target) =>
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, target);
```

### `apps/api/src/mcp/mcp-tool.registry.ts` (novo, substitui `mcp-tools.registry.ts`)

Usa `DiscoveryService` (`@nestjs/core`) para varrer providers com metadata `mcp:tool` no boot e cachear a lista. Expõe:

```ts
bindAll(server: McpServer, ctx: McpToolContext): void
```

Itera as tools cacheadas e chama `server.registerTool(name, { description, inputSchema }, handler)`. O handler:

1. Recebe o input já validado pelo SDK contra o `inputSchema` Zod.
2. Chama `tool.execute(input, ctx)`.
3. Serializa o retorno via helper `ok(data) → { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }`.

### Tools como providers

Cada tool é uma classe Nest provider que implementa `McpToolDef`:

```ts
// apps/api/src/nutrition/mcp/get-nutrition-summary.tool.ts
@Injectable()
@McpTool()
export class GetNutritionSummaryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  name = 'get_nutrition_summary';
  description = 'Resumo nutricional do dia (totais + refeições).';
  inputSchema = { date: z.string().describe('YYYY-MM-DD') };
  execute({ date }, { userId }) {
    return this.summary.getDay(userId, date);
  }
}
```

### Módulos de domínio

`NutritionModule` (e futuros `WorkoutModule`, `ProgressModule`) declaram suas tools como providers normais. Sem `exports`, sem array central — `DiscoveryService` enxerga via DI global.

```ts
// nutrition.module.ts
@Module({
  providers: [
    // services existentes…
    GetNutritionSummaryTool,
    LogMealTool,
    // … 15+ tools de nutrição …
  ],
})
export class NutritionModule {}
```

### `McpModule` e `McpController`

- `McpModule` importa `DiscoveryModule`, `NutritionModule` (e, futuramente, `WorkoutModule` etc.) e declara `MetaTool`s próprias (em `mcp/tools/meta/`).
- `McpController` continua igual: cria `McpServer` por request, chama `this.registry.bindAll(server, { userId })`, plugga no transport HTTP.

## Estrutura de arquivos final

```
apps/api/src/
├── mcp/
│   ├── mcp.module.ts             # importa NutritionModule + DiscoveryModule
│   ├── mcp.controller.ts         # inalterado (cria server por request)
│   ├── mcp-auth.guard.ts         # inalterado
│   ├── mcp-token.service.ts      # inalterado
│   ├── mcp-tokens.controller.ts  # inalterado
│   ├── tool.decorator.ts         # NOVO
│   ├── mcp-tool.registry.ts      # NOVO (substitui mcp-tools.registry.ts)
│   └── tools/
│       └── meta/
│           ├── get-me.tool.ts
│           ├── update-timezone.tool.ts
│           ├── list-my-tokens.tool.ts
│           └── revoke-token.tool.ts
└── nutrition/
    ├── nutrition.module.ts
    └── mcp/
        ├── search-food.tool.ts
        ├── get-food.tool.ts
        ├── list-food-groups.tool.ts
        ├── create-custom-food.tool.ts
        ├── update-custom-food.tool.ts
        ├── delete-custom-food.tool.ts
        ├── log-meal.tool.ts
        ├── get-meal.tool.ts
        ├── list-meals.tool.ts
        ├── update-meal.tool.ts
        ├── delete-meal.tool.ts
        ├── add-meal-item.tool.ts
        ├── update-meal-item.tool.ts
        ├── delete-meal-item.tool.ts
        ├── get-nutrition-summary.tool.ts
        ├── get-nutrition-history.tool.ts
        ├── get-nutrition-goals.tool.ts
        └── set-nutrition-goals.tool.ts
```

## Migração

1. Criar `tool.decorator.ts` e `mcp-tool.registry.ts`.
2. Extrair cada bloco do `mcp-tools.registry.ts` atual para um `*.tool.ts` no domínio correspondente (15–30 linhas cada). Tools "meta" (`get_me`, `update_timezone`, `list_my_tokens`, `revoke_token`) vão para `mcp/tools/meta/`.
3. Declarar tools como providers nos respectivos módulos (`NutritionModule`, `McpModule` para meta).
4. Trocar `McpController` para usar `McpToolRegistry.bindAll` em vez do `McpToolsRegistry.registerAll` antigo.
5. Apagar `mcp-tools.registry.ts`.
6. Validar end-to-end com MCP Inspector: listar tools (mesmo conjunto de antes) e executar `get_nutrition_summary`, `log_meal`, `list_my_tokens`.

## Verificação

- `pnpm --filter api typecheck && pnpm --filter api lint` passam.
- `pnpm --filter api dev` sobe limpo; `tools/list` retorna o mesmo conjunto que hoje (22 tools).
- `get_nutrition_summary` via MCP Inspector retorna o mesmo payload de antes da refatoração.
- Adicionar uma tool "throwaway" em `nutrition/mcp/ping.tool.ts`: aparece no `tools/list` sem editar nenhum outro arquivo (depois remover).

## Extensão futura (Fase 2/3)

`WorkoutModule` declara `LogSetTool`, `StartSessionTool`, etc. em providers. `McpModule` importa `WorkoutModule`. Zero mudança no `mcp-tool.registry.ts`. Mesma receita para `ProgressModule`.

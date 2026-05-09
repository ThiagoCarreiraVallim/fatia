# MCP Modular Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o registry monolítico do MCP (`mcp-tools.registry.ts`, 339 linhas) para uma arquitetura modular: uma tool por arquivo, junto do domínio dono, descoberta automática via decorator `@McpTool()` + `DiscoveryService` do Nest.

**Architecture:** Cada tool vira uma classe Nest provider que implementa `McpToolDef` e é decorada com `@McpTool()`. Um `McpToolRegistry` injeta `DiscoveryService` no boot, varre o container DI procurando providers com a metadata `mcp:tool`, e expõe `bindAll(server, ctx)` para registrar todas no `McpServer` por request. Tools de domínio moram em `apps/api/src/nutrition/mcp/`; tools meta moram em `apps/api/src/mcp/tools/meta/`.

**Tech Stack:** NestJS 11 (`@nestjs/core` `DiscoveryService`), `@modelcontextprotocol/sdk`, Zod, `reflect-metadata` (já carregado pelo Nest).

---

## File Structure

**Novos:**

- `apps/api/src/mcp/tool.decorator.ts` — decorator + interface `McpToolDef`
- `apps/api/src/mcp/mcp-tool.registry.ts` — discovery + `bindAll`
- `apps/api/src/mcp/tools/meta/get-me.tool.ts`
- `apps/api/src/mcp/tools/meta/update-timezone.tool.ts`
- `apps/api/src/mcp/tools/meta/list-my-tokens.tool.ts`
- `apps/api/src/mcp/tools/meta/revoke-token.tool.ts`
- `apps/api/src/nutrition/mcp/search-food.tool.ts`
- `apps/api/src/nutrition/mcp/get-food.tool.ts`
- `apps/api/src/nutrition/mcp/list-food-groups.tool.ts`
- `apps/api/src/nutrition/mcp/create-custom-food.tool.ts`
- `apps/api/src/nutrition/mcp/update-custom-food.tool.ts`
- `apps/api/src/nutrition/mcp/delete-custom-food.tool.ts`
- `apps/api/src/nutrition/mcp/log-meal.tool.ts`
- `apps/api/src/nutrition/mcp/get-meal.tool.ts`
- `apps/api/src/nutrition/mcp/list-meals.tool.ts`
- `apps/api/src/nutrition/mcp/update-meal.tool.ts`
- `apps/api/src/nutrition/mcp/delete-meal.tool.ts`
- `apps/api/src/nutrition/mcp/add-meal-item.tool.ts`
- `apps/api/src/nutrition/mcp/update-meal-item.tool.ts`
- `apps/api/src/nutrition/mcp/delete-meal-item.tool.ts`
- `apps/api/src/nutrition/mcp/get-nutrition-summary.tool.ts`
- `apps/api/src/nutrition/mcp/get-nutrition-history.tool.ts`
- `apps/api/src/nutrition/mcp/get-nutrition-goals.tool.ts`
- `apps/api/src/nutrition/mcp/set-nutrition-goals.tool.ts`

**Modificados:**

- `apps/api/src/mcp/mcp.module.ts` — importar `DiscoveryModule`, registrar `McpToolRegistry` + meta tools
- `apps/api/src/mcp/mcp.controller.ts` — usar `McpToolRegistry.bindAll`
- `apps/api/src/nutrition/nutrition.module.ts` — declarar 18 tools como providers

**Deletado:**

- `apps/api/src/mcp/mcp-tools.registry.ts`

---

## Task 1: Criar decorator e interface

**Files:**

- Create: `apps/api/src/mcp/tool.decorator.ts`

- [ ] **Step 1: Criar o arquivo do decorator**

```ts
// apps/api/src/mcp/tool.decorator.ts
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

export const McpTool = (): ClassDecorator => (target) => {
  Reflect.defineMetadata(MCP_TOOL_METADATA, true, target);
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS (sem novos erros).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mcp/tool.decorator.ts
git commit -m "feat(mcp): add McpTool decorator and McpToolDef interface"
```

---

## Task 2: Criar McpToolRegistry com DiscoveryService

**Files:**

- Create: `apps/api/src/mcp/mcp-tool.registry.ts`

- [ ] **Step 1: Criar o registry**

```ts
// apps/api/src/mcp/mcp-tool.registry.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MCP_TOOL_METADATA, type McpToolContext, type McpToolDef } from './tool.decorator';

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

@Injectable()
export class McpToolRegistry implements OnModuleInit {
  private readonly logger = new Logger(McpToolRegistry.name);
  private tools: McpToolDef[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    const providers = this.discovery.getProviders();
    this.tools = providers
      .filter((wrapper) => wrapper.metatype && wrapper.instance)
      .filter((wrapper) => Reflect.getMetadata(MCP_TOOL_METADATA, wrapper.metatype as object))
      .map((wrapper) => wrapper.instance as McpToolDef);

    const names = this.tools.map((t) => t.name).sort();
    const dups = names.filter((n, i) => names.indexOf(n) !== i);
    if (dups.length > 0) {
      throw new Error(`Duplicate MCP tool names: ${dups.join(', ')}`);
    }
    this.logger.log(`Discovered ${this.tools.length} MCP tools: ${names.join(', ')}`);
  }

  bindAll(server: McpServer, ctx: McpToolContext): void {
    for (const tool of this.tools) {
      // O type signature de registerTool gera type-instantiation explosivo;
      // contornamos com cast localizado (mesmo padrão do registry antigo).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server as any).registerTool(
        tool.name,
        { description: tool.description, inputSchema: tool.inputSchema },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (input: any) => ok(await tool.execute(input, ctx)),
      );
    }
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/mcp/mcp-tool.registry.ts
git commit -m "feat(mcp): add McpToolRegistry with DiscoveryService autodiscovery"
```

---

## Task 3: Migrar tools meta (4 tools)

**Files:**

- Create: `apps/api/src/mcp/tools/meta/get-me.tool.ts`
- Create: `apps/api/src/mcp/tools/meta/update-timezone.tool.ts`
- Create: `apps/api/src/mcp/tools/meta/list-my-tokens.tool.ts`
- Create: `apps/api/src/mcp/tools/meta/revoke-token.tool.ts`

- [ ] **Step 1: Criar `get-me.tool.ts`**

```ts
// apps/api/src/mcp/tools/meta/get-me.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../tool.decorator';

@Injectable()
@McpTool()
export class GetMeTool implements McpToolDef {
  constructor(private readonly prisma: PrismaService) {}
  readonly name = 'get_me';
  readonly description = 'Retorna o perfil do usuário autenticado.';
  readonly inputSchema = {} as const;
  execute(_input: z.infer<z.ZodObject<typeof this.inputSchema>>, { userId }: McpToolContext) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, timezone: true },
    });
  }
}
```

- [ ] **Step 2: Criar `update-timezone.tool.ts`**

```ts
// apps/api/src/mcp/tools/meta/update-timezone.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../tool.decorator';

@Injectable()
@McpTool()
export class UpdateTimezoneTool implements McpToolDef {
  constructor(private readonly prisma: PrismaService) {}
  readonly name = 'update_timezone';
  readonly description = 'Atualiza o fuso horário do usuário (IANA, ex.: "America/Sao_Paulo").';
  readonly inputSchema = { timezone: z.string().min(3).max(60) } as const;
  execute({ timezone }: { timezone: string }, { userId }: McpToolContext) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
      select: { id: true, timezone: true },
    });
  }
}
```

- [ ] **Step 3: Criar `list-my-tokens.tool.ts`**

```ts
// apps/api/src/mcp/tools/meta/list-my-tokens.tool.ts
import { Injectable } from '@nestjs/common';
import { McpTokenService } from '../../mcp-token.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../tool.decorator';

@Injectable()
@McpTool()
export class ListMyTokensTool implements McpToolDef {
  constructor(private readonly tokens: McpTokenService) {}
  readonly name = 'list_my_tokens';
  readonly description = 'Lista os tokens MCP ativos do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: unknown, { userId }: McpToolContext) {
    return this.tokens.list(userId);
  }
}
```

- [ ] **Step 4: Criar `revoke-token.tool.ts`**

```ts
// apps/api/src/mcp/tools/meta/revoke-token.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTokenService } from '../../mcp-token.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../tool.decorator';

@Injectable()
@McpTool()
export class RevokeTokenTool implements McpToolDef {
  constructor(private readonly tokens: McpTokenService) {}
  readonly name = 'revoke_token';
  readonly description = 'Revoga um token MCP do usuário.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.tokens.revoke(userId, id);
    return { revoked: id };
  }
}
```

- [ ] **Step 5: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/mcp/tools/meta/
git commit -m "feat(mcp): extract meta tools (get_me, update_timezone, list_my_tokens, revoke_token)"
```

---

## Task 4: Migrar tools de food (6 tools)

**Files:**

- Create: `apps/api/src/nutrition/mcp/search-food.tool.ts`
- Create: `apps/api/src/nutrition/mcp/get-food.tool.ts`
- Create: `apps/api/src/nutrition/mcp/list-food-groups.tool.ts`
- Create: `apps/api/src/nutrition/mcp/create-custom-food.tool.ts`
- Create: `apps/api/src/nutrition/mcp/update-custom-food.tool.ts`
- Create: `apps/api/src/nutrition/mcp/delete-custom-food.tool.ts`

- [ ] **Step 1: Criar `search-food.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/search-food.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class SearchFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'search_food';
  readonly description = 'Busca alimentos no catálogo TACO + customs do usuário.';
  readonly inputSchema = {
    q: z.string().optional(),
    groupId: z.number().int().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  } as const;
  execute(params: { q?: string; groupId?: number; limit?: number }, { userId }: McpToolContext) {
    return this.foods.search(userId, params);
  }
}
```

- [ ] **Step 2: Criar `get-food.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/get-food.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'get_food';
  readonly description = 'Detalhe de um alimento por id.';
  readonly inputSchema = { id: z.number().int() } as const;
  execute({ id }: { id: number }, { userId }: McpToolContext) {
    return this.foods.get(userId, id);
  }
}
```

- [ ] **Step 3: Criar `list-food-groups.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/list-food-groups.tool.ts
import { Injectable } from '@nestjs/common';
import { FoodService } from '../food.service';
import { McpTool, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class ListFoodGroupsTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'list_food_groups';
  readonly description = 'Lista todos os grupos de alimentos.';
  readonly inputSchema = {} as const;
  execute() {
    return this.foods.listGroups();
  }
}
```

- [ ] **Step 4: Criar `create-custom-food.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/create-custom-food.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class CreateCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'create_custom_food';
  readonly description = 'Cria um alimento custom para o usuário.';
  readonly inputSchema = {
    name: z.string().min(1).max(160),
    groupId: z.number().int().optional(),
    kcalPer100g: z.number().min(0),
    proteinPer100g: z.number().min(0),
    carbsPer100g: z.number().min(0),
    fatPer100g: z.number().min(0),
  } as const;
  execute(
    input: {
      name: string;
      groupId?: number;
      kcalPer100g: number;
      proteinPer100g: number;
      carbsPer100g: number;
      fatPer100g: number;
    },
    { userId }: McpToolContext,
  ) {
    return this.foods.createCustom(userId, input);
  }
}
```

- [ ] **Step 5: Criar `update-custom-food.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/update-custom-food.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class UpdateCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'update_custom_food';
  readonly description = 'Atualiza um alimento custom do usuário.';
  readonly inputSchema = {
    id: z.number().int(),
    name: z.string().min(1).max(160).optional(),
    groupId: z.number().int().optional(),
    kcalPer100g: z.number().min(0).optional(),
    proteinPer100g: z.number().min(0).optional(),
    carbsPer100g: z.number().min(0).optional(),
    fatPer100g: z.number().min(0).optional(),
  } as const;
  execute({ id, ...rest }: { id: number } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.foods.updateCustom(userId, id, rest);
  }
}
```

- [ ] **Step 6: Criar `delete-custom-food.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/delete-custom-food.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { FoodService } from '../food.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class DeleteCustomFoodTool implements McpToolDef {
  constructor(private readonly foods: FoodService) {}
  readonly name = 'delete_custom_food';
  readonly description = 'Remove um alimento custom do usuário.';
  readonly inputSchema = { id: z.number().int() } as const;
  async execute({ id }: { id: number }, { userId }: McpToolContext) {
    await this.foods.deleteCustom(userId, id);
    return { deleted: id };
  }
}
```

- [ ] **Step 7: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/nutrition/mcp/{search-food,get-food,list-food-groups,create-custom-food,update-custom-food,delete-custom-food}.tool.ts
git commit -m "feat(mcp): extract food tools to nutrition/mcp/"
```

---

## Task 5: Migrar tools de meal (5 tools)

**Files:**

- Create: `apps/api/src/nutrition/mcp/log-meal.tool.ts`
- Create: `apps/api/src/nutrition/mcp/get-meal.tool.ts`
- Create: `apps/api/src/nutrition/mcp/list-meals.tool.ts`
- Create: `apps/api/src/nutrition/mcp/update-meal.tool.ts`
- Create: `apps/api/src/nutrition/mcp/delete-meal.tool.ts`

- [ ] **Step 1: Criar `log-meal.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/log-meal.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

const itemSchema = z.object({
  foodId: z.number().int().optional(),
  foodName: z.string().optional(),
  grams: z.number().min(0.1),
  kcal: z.number().min(0).optional(),
  proteinG: z.number().min(0).optional(),
  carbsG: z.number().min(0).optional(),
  fatG: z.number().min(0).optional(),
  groupId: z.number().int().optional(),
});

@Injectable()
@McpTool()
export class LogMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'log_meal';
  readonly description =
    'Registra uma refeição com items. Cada item pode referenciar foodId (TACO/custom) ou ser livre (foodName + macros estimados).';
  readonly inputSchema = {
    mealType: z.nativeEnum(MealType),
    eatenAt: z.string().describe('ISO 8601 datetime'),
    notes: z.string().max(500).optional(),
    items: z.array(itemSchema).min(1),
  } as const;
  execute(
    input: {
      mealType: MealType;
      eatenAt: string;
      notes?: string;
      items: z.infer<typeof itemSchema>[];
    },
    { userId }: McpToolContext,
  ) {
    return this.meals.create(userId, input);
  }
}
```

- [ ] **Step 2: Criar `get-meal.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/get-meal.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'get_meal';
  readonly description = 'Detalha uma refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  execute({ id }: { id: string }, { userId }: McpToolContext) {
    return this.meals.findById(userId, id);
  }
}
```

- [ ] **Step 3: Criar `list-meals.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/list-meals.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class ListMealsTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'list_meals';
  readonly description = 'Lista refeições do usuário (cursor pagination).';
  readonly inputSchema = {
    date: z.string().optional().describe('YYYY-MM-DD para filtrar pelo dia'),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  } as const;
  execute(input: { date?: string; cursor?: string; limit?: number }, { userId }: McpToolContext) {
    return this.meals.list(userId, input);
  }
}
```

- [ ] **Step 4: Criar `update-meal.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/update-meal.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealType } from '@prisma/client';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class UpdateMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'update_meal';
  readonly description = 'Atualiza metadados da refeição (mealType/eatenAt/notes).';
  readonly inputSchema = {
    id: z.string().uuid(),
    mealType: z.nativeEnum(MealType).optional(),
    eatenAt: z.string().optional(),
    notes: z.string().max(500).optional(),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.meals.update(userId, id, rest);
  }
}
```

- [ ] **Step 5: Criar `delete-meal.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/delete-meal.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealService } from '../meal.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealTool implements McpToolDef {
  constructor(private readonly meals: MealService) {}
  readonly name = 'delete_meal';
  readonly description = 'Remove uma refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.meals.delete(userId, id);
    return { deleted: id };
  }
}
```

- [ ] **Step 6: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/nutrition/mcp/{log-meal,get-meal,list-meals,update-meal,delete-meal}.tool.ts
git commit -m "feat(mcp): extract meal tools to nutrition/mcp/"
```

---

## Task 6: Migrar tools de meal-item (3 tools)

**Files:**

- Create: `apps/api/src/nutrition/mcp/add-meal-item.tool.ts`
- Create: `apps/api/src/nutrition/mcp/update-meal-item.tool.ts`
- Create: `apps/api/src/nutrition/mcp/delete-meal-item.tool.ts`

- [ ] **Step 1: Criar `add-meal-item.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/add-meal-item.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class AddMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'add_meal_item';
  readonly description = 'Adiciona um item a uma refeição existente.';
  readonly inputSchema = {
    mealId: z.string().uuid(),
    foodId: z.number().int().optional(),
    foodName: z.string().optional(),
    grams: z.number().min(0.1),
    kcal: z.number().min(0).optional(),
    proteinG: z.number().min(0).optional(),
    carbsG: z.number().min(0).optional(),
    fatG: z.number().min(0).optional(),
    groupId: z.number().int().optional(),
  } as const;
  execute(
    { mealId, ...item }: { mealId: string; grams: number } & Record<string, unknown>,
    { userId }: McpToolContext,
  ) {
    return this.mealItems.add(userId, mealId, item as never);
  }
}
```

- [ ] **Step 2: Criar `update-meal-item.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/update-meal-item.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class UpdateMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'update_meal_item';
  readonly description = 'Atualiza gramas ou macros de um item.';
  readonly inputSchema = {
    id: z.string().uuid(),
    grams: z.number().min(0.1).optional(),
    kcal: z.number().min(0).optional(),
    proteinG: z.number().min(0).optional(),
    carbsG: z.number().min(0).optional(),
    fatG: z.number().min(0).optional(),
  } as const;
  execute({ id, ...rest }: { id: string } & Record<string, unknown>, { userId }: McpToolContext) {
    return this.mealItems.update(userId, id, rest);
  }
}
```

- [ ] **Step 3: Criar `delete-meal-item.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/delete-meal-item.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealItemService } from '../meal-item.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealItemTool implements McpToolDef {
  constructor(private readonly mealItems: MealItemService) {}
  readonly name = 'delete_meal_item';
  readonly description = 'Remove um item de refeição.';
  readonly inputSchema = { id: z.string().uuid() } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.mealItems.delete(userId, id);
    return { deleted: id };
  }
}
```

- [ ] **Step 4: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/nutrition/mcp/{add-meal-item,update-meal-item,delete-meal-item}.tool.ts
git commit -m "feat(mcp): extract meal-item tools to nutrition/mcp/"
```

---

## Task 7: Migrar tools de summary e goals (4 tools)

**Files:**

- Create: `apps/api/src/nutrition/mcp/get-nutrition-summary.tool.ts`
- Create: `apps/api/src/nutrition/mcp/get-nutrition-history.tool.ts`
- Create: `apps/api/src/nutrition/mcp/get-nutrition-goals.tool.ts`
- Create: `apps/api/src/nutrition/mcp/set-nutrition-goals.tool.ts`

- [ ] **Step 1: Criar `get-nutrition-summary.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/get-nutrition-summary.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionSummaryService } from '../nutrition-summary.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionSummaryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  readonly name = 'get_nutrition_summary';
  readonly description = 'Resumo nutricional do dia (totais + refeições).';
  readonly inputSchema = { date: z.string().describe('YYYY-MM-DD') } as const;
  execute({ date }: { date: string }, { userId }: McpToolContext) {
    return this.summary.getDay(userId, date);
  }
}
```

- [ ] **Step 2: Criar `get-nutrition-history.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/get-nutrition-history.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NutritionSummaryService } from '../nutrition-summary.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionHistoryTool implements McpToolDef {
  constructor(private readonly summary: NutritionSummaryService) {}
  readonly name = 'get_nutrition_history';
  readonly description = 'Histórico dos últimos N dias com médias.';
  readonly inputSchema = { days: z.number().int().min(1).max(90).default(7) } as const;
  execute({ days }: { days: number }, { userId }: McpToolContext) {
    return this.summary.getHistory(userId, days);
  }
}
```

- [ ] **Step 3: Criar `get-nutrition-goals.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/get-nutrition-goals.tool.ts
import { Injectable } from '@nestjs/common';
import { UserGoalsService } from '../user-goals.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class GetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'get_nutrition_goals';
  readonly description = 'Retorna as metas nutricionais do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: unknown, { userId }: McpToolContext) {
    return this.goals.get(userId);
  }
}
```

- [ ] **Step 4: Criar `set-nutrition-goals.tool.ts`**

```ts
// apps/api/src/nutrition/mcp/set-nutrition-goals.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UserGoalsService } from '../user-goals.service';
import { McpTool, type McpToolContext, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class SetNutritionGoalsTool implements McpToolDef {
  constructor(private readonly goals: UserGoalsService) {}
  readonly name = 'set_nutrition_goals';
  readonly description = 'Cria/atualiza as metas nutricionais do usuário.';
  readonly inputSchema = {
    kcalMin: z.number().int().min(0),
    kcalMax: z.number().int().min(0),
    proteinMinG: z.number().int().min(0),
    proteinMaxG: z.number().int().min(0),
    carbsMinG: z.number().int().min(0),
    carbsMaxG: z.number().int().min(0),
    fatMinG: z.number().int().min(0),
    fatMaxG: z.number().int().min(0),
    weeklyWorkouts: z.number().int().min(0).optional(),
    dailyStepsTarget: z.number().int().min(0).optional(),
  } as const;
  execute(
    input: {
      kcalMin: number;
      kcalMax: number;
      proteinMinG: number;
      proteinMaxG: number;
      carbsMinG: number;
      carbsMaxG: number;
      fatMinG: number;
      fatMaxG: number;
      weeklyWorkouts?: number;
      dailyStepsTarget?: number;
    },
    { userId }: McpToolContext,
  ) {
    return this.goals.upsert(userId, input);
  }
}
```

- [ ] **Step 5: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/nutrition/mcp/{get-nutrition-summary,get-nutrition-history,get-nutrition-goals,set-nutrition-goals}.tool.ts
git commit -m "feat(mcp): extract summary/goals tools to nutrition/mcp/"
```

---

## Task 8: Registrar tools nos módulos (NutritionModule + McpModule)

**Files:**

- Modify: `apps/api/src/nutrition/nutrition.module.ts`
- Modify: `apps/api/src/mcp/mcp.module.ts`

- [ ] **Step 1: Atualizar `nutrition.module.ts` com as 18 tools**

Substituir o conteúdo inteiro do arquivo por:

```ts
// apps/api/src/nutrition/nutrition.module.ts
import { Module } from '@nestjs/common';
import { NutritionController } from './nutrition.controller';
import { FoodService } from './food.service';
import { MealService } from './meal.service';
import { MealItemService } from './meal-item.service';
import { NutritionSummaryService } from './nutrition-summary.service';
import { UserGoalsService } from './user-goals.service';
import { SearchFoodTool } from './mcp/search-food.tool';
import { GetFoodTool } from './mcp/get-food.tool';
import { ListFoodGroupsTool } from './mcp/list-food-groups.tool';
import { CreateCustomFoodTool } from './mcp/create-custom-food.tool';
import { UpdateCustomFoodTool } from './mcp/update-custom-food.tool';
import { DeleteCustomFoodTool } from './mcp/delete-custom-food.tool';
import { LogMealTool } from './mcp/log-meal.tool';
import { GetMealTool } from './mcp/get-meal.tool';
import { ListMealsTool } from './mcp/list-meals.tool';
import { UpdateMealTool } from './mcp/update-meal.tool';
import { DeleteMealTool } from './mcp/delete-meal.tool';
import { AddMealItemTool } from './mcp/add-meal-item.tool';
import { UpdateMealItemTool } from './mcp/update-meal-item.tool';
import { DeleteMealItemTool } from './mcp/delete-meal-item.tool';
import { GetNutritionSummaryTool } from './mcp/get-nutrition-summary.tool';
import { GetNutritionHistoryTool } from './mcp/get-nutrition-history.tool';
import { GetNutritionGoalsTool } from './mcp/get-nutrition-goals.tool';
import { SetNutritionGoalsTool } from './mcp/set-nutrition-goals.tool';

@Module({
  controllers: [NutritionController],
  providers: [
    FoodService,
    MealService,
    MealItemService,
    NutritionSummaryService,
    UserGoalsService,
    // MCP tools (auto-discovered by McpToolRegistry)
    SearchFoodTool,
    GetFoodTool,
    ListFoodGroupsTool,
    CreateCustomFoodTool,
    UpdateCustomFoodTool,
    DeleteCustomFoodTool,
    LogMealTool,
    GetMealTool,
    ListMealsTool,
    UpdateMealTool,
    DeleteMealTool,
    AddMealItemTool,
    UpdateMealItemTool,
    DeleteMealItemTool,
    GetNutritionSummaryTool,
    GetNutritionHistoryTool,
    GetNutritionGoalsTool,
    SetNutritionGoalsTool,
  ],
  exports: [FoodService, MealService, MealItemService, NutritionSummaryService, UserGoalsService],
})
export class NutritionModule {}
```

- [ ] **Step 2: Atualizar `mcp.module.ts` com `DiscoveryModule`, `McpToolRegistry` e meta tools**

Substituir o conteúdo inteiro do arquivo por:

```ts
// apps/api/src/mcp/mcp.module.ts
import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { NutritionModule } from '../nutrition/nutrition.module';
import { McpController } from './mcp.controller';
import { McpTokensController } from './mcp-tokens.controller';
import { McpTokenService } from './mcp-token.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolRegistry } from './mcp-tool.registry';
import { GetMeTool } from './tools/meta/get-me.tool';
import { UpdateTimezoneTool } from './tools/meta/update-timezone.tool';
import { ListMyTokensTool } from './tools/meta/list-my-tokens.tool';
import { RevokeTokenTool } from './tools/meta/revoke-token.tool';

@Module({
  imports: [DiscoveryModule, NutritionModule],
  controllers: [McpController, McpTokensController],
  providers: [
    McpTokenService,
    McpAuthGuard,
    McpToolRegistry,
    GetMeTool,
    UpdateTimezoneTool,
    ListMyTokensTool,
    RevokeTokenTool,
  ],
})
export class McpModule {}
```

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/nutrition/nutrition.module.ts apps/api/src/mcp/mcp.module.ts
git commit -m "feat(mcp): wire tools into NutritionModule and McpModule with DiscoveryModule"
```

---

## Task 9: Trocar McpController para usar McpToolRegistry e remover registry antigo

**Files:**

- Modify: `apps/api/src/mcp/mcp.controller.ts`
- Delete: `apps/api/src/mcp/mcp-tools.registry.ts`

- [ ] **Step 1: Atualizar `mcp.controller.ts`**

Substituir o conteúdo inteiro do arquivo por:

```ts
// apps/api/src/mcp/mcp.controller.ts
import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, type CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolRegistry } from './mcp-tool.registry';

@Public() // bypass JwtAuthGuard global; McpAuthGuard handles auth
@UseGuards(McpAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(private readonly registry: McpToolRegistry) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response, @CurrentUser() user: CurrentUserPayload) {
    const server = new McpServer(
      { name: 'fatia-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    this.registry.bindAll(server, { userId: user.id });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
```

- [ ] **Step 2: Deletar o registry antigo**

Run:

```bash
rm apps/api/src/mcp/mcp-tools.registry.ts
```

- [ ] **Step 3: Verificar typecheck**

Run: `pnpm --filter api typecheck`
Expected: PASS (nenhuma referência sobrando ao `McpToolsRegistry`).

- [ ] **Step 4: Verificar lint**

Run: `pnpm --filter api lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mcp/mcp.controller.ts apps/api/src/mcp/mcp-tools.registry.ts
git commit -m "refactor(mcp): switch controller to McpToolRegistry, remove old monolithic registry"
```

---

## Task 10: Verificação end-to-end

**Files:**

- (nenhum — apenas validação manual)

- [ ] **Step 1: Subir a API**

Run em um terminal separado:

```bash
pnpm --filter api dev
```

Esperado nos logs: linha `Discovered 22 MCP tools: add_meal_item, create_custom_food, delete_custom_food, delete_meal, delete_meal_item, get_food, get_me, get_meal, get_nutrition_goals, get_nutrition_history, get_nutrition_summary, list_food_groups, list_meals, list_my_tokens, log_meal, revoke_token, search_food, set_nutrition_goals, update_custom_food, update_meal, update_meal_item, update_timezone` (ordem alfabética).

- [ ] **Step 2: Listar tools via curl**

Substitua `$TOKEN` pelo token MCP em `~/.claude.json` (entrada `fatia`). Esperado: 22 tools.

```bash
curl -sS -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep -o '"name":"[^"]*"' | wc -l
```

Expected output: `22`

- [ ] **Step 3: Executar `get_nutrition_summary` via curl**

```bash
curl -sS -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_nutrition_summary","arguments":{"date":"2026-05-08"}}}'
```

Expected: payload com `totals` e `meals` (mesmo formato de antes da refatoração; o último teste retornou 472 kcal / 1 meal LUNCH para 2026-05-07).

- [ ] **Step 4: Smoke test de adição de tool nova**

Criar `apps/api/src/nutrition/mcp/ping.tool.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolDef } from '../../mcp/tool.decorator';

@Injectable()
@McpTool()
export class PingTool implements McpToolDef {
  readonly name = 'ping';
  readonly description = 'Health check tool (smoke test).';
  readonly inputSchema = {} as const;
  execute() {
    return { pong: true, ts: new Date().toISOString() };
  }
}
```

Adicionar `PingTool` ao array `providers` de `nutrition.module.ts`. Reiniciar a API. Confirmar que `tools/list` agora retorna `23`.

```bash
curl -sS -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}' | grep -o '"name":"ping"'
```

Expected output: `"name":"ping"` (linha encontrada).

- [ ] **Step 5: Remover o smoke test e reiniciar**

```bash
rm apps/api/src/nutrition/mcp/ping.tool.ts
```

Reverter o import e a entrada `PingTool` em `nutrition.module.ts`. Reiniciar a API. Confirmar que `tools/list` voltou a 22.

- [ ] **Step 6: Commit final (verificação concluída)**

Não há mudanças pra commitar (smoke test foi removido). Apenas confirmar:

```bash
git status
```

Expected: `working tree clean`.

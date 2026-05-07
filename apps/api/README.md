# @fatia/api

Backend NestJS — REST + MCP server.

## Setup (a ser executado em F0.4)

```bash
cd apps
nest new api --package-manager pnpm
cd api

# Adicionar deps
pnpm add @fatia/db@workspace:*
pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm add @nestjs/throttler helmet
pnpm add nestjs-pino pino-http pino-pretty
pnpm add zod
pnpm add @modelcontextprotocol/sdk
pnpm add argon2
pnpm add class-validator class-transformer
```

## Estrutura prevista

```
src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts
│   ├── jwt-auth.guard.ts
│   ├── mcp-auth.guard.ts
│   └── decorators/
│       ├── current-user.decorator.ts
│       └── public.decorator.ts
├── users/
├── nutrition/
│   ├── food.service.ts
│   ├── meal.service.ts
│   ├── nutrition.controller.ts
│   └── dto/
├── workout/
│   ├── exercise.service.ts
│   ├── plan.service.ts
│   ├── session.service.ts
│   ├── workout.controller.ts
│   └── dto/
├── progress/
├── mcp/
│   ├── mcp.module.ts
│   ├── mcp.controller.ts
│   ├── mcp.service.ts
│   └── tools/
│       ├── nutrition.tools.ts
│       ├── workout.tools.ts
│       └── progress.tools.ts
├── common/
│   ├── prisma.service.ts
│   └── filters/
├── app.module.ts
└── main.ts
```

Veja `docs/TASKS.md` Fase 0.4 em diante para a ordem de implementação.

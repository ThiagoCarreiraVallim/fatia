# Fatia

App pessoal multi-usuário para tracking de nutrição e treino, **MCP-first** com integração nativa ao Claude.

## Visão geral

Backend NestJS + Postgres expondo um servidor MCP completo (~50 tools cobrindo CRUD de toda a aplicação) + REST mínimo pra suportar o PWA. Foto de refeição é analisada pelo Claude e enviada como dados estruturados via MCP — o app não armazena imagens.

**Por que MCP-first?** Veja [`docs/ADR/006-mcp-first.md`](docs/ADR/006-mcp-first.md). Em resumo: o uso real do app é pelo Claude no celular, então toda funcionalidade está disponível por lá. O PWA é uma camada de visualização e edição pontual.

## Quick start

Pré-requisitos: Node 20+ (`nvm use`), Docker, e `corepack enable` (para o pnpm 9 pinado em `packageManager`).

```bash
git clone https://github.com/ThiagoCarreiraVallim/fatia.git
cd fatia
pnpm setup   # corepack + install + postgres up + migrate + seed
pnpm dev     # API + Web com hot reload
```

API em `http://localhost:3000`, Web em `http://localhost:3001`, MCP em `http://localhost:3000/mcp`.

Próximos passos:

- **Rodar e contribuir** → [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- **Subir o auth (Logto) local** → [`docs/LOCAL_AUTH.md`](docs/LOCAL_AUTH.md)
- **Testar MCP tools com Claude / clientes open-source** → [`docs/MCP_LOCAL.md`](docs/MCP_LOCAL.md)

## Documentação

| Arquivo                                        | Conteúdo                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md)     | Setup local, scripts, modos de desenvolvimento, troubleshooting                    |
| [`docs/LOCAL_AUTH.md`](docs/LOCAL_AUTH.md)     | Logto local: tenant, apps, API resource, `.env`                                    |
| [`docs/MCP_LOCAL.md`](docs/MCP_LOCAL.md)       | Registrar o MCP local no Claude Desktop / Code / clientes open-source + smoke test |
| [`docs/PRD.md`](docs/PRD.md)                   | Product Requirements — o que é o produto, escopo, não-escopo                       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitetura técnica, stack, decisões                                               |
| [`docs/DESIGN.md`](docs/DESIGN.md)             | UX, telas do PWA, fluxos                                                           |
| [`docs/MCP.md`](docs/MCP.md)                   | Especificação das tools MCP expostas                                               |
| [`docs/CLAUDE.md`](docs/CLAUDE.md)             | Instruções para o Claude trabalhando no código                                     |
| [`docs/TASKS.md`](docs/TASKS.md)               | Checklist completo de implementação                                                |
| [`docs/ADR/`](docs/ADR/)                       | Architecture Decision Records                                                      |

## Estrutura

```
fatia/
├── apps/
│   ├── api/           # NestJS (REST + MCP)
│   └── web/           # Next.js PWA
├── packages/
│   └── db/            # Prisma schema + client compartilhado
├── infra/             # docker-compose, scripts
└── docs/              # Documentação
```

## Stack

- **Backend:** NestJS, Prisma, Postgres 16, JWT
- **Frontend:** Next.js 15, Tailwind, shadcn/ui, Recharts
- **Infra:** Docker Compose no servidor próprio
- **MCP:** `@modelcontextprotocol/sdk` exposto via HTTP no NestJS

## Status

🚧 Em desenvolvimento — Fase 0 (setup).

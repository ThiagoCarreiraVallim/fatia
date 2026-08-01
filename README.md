# Fatia

App pessoal multi-usuário para tracking de nutrição e treino, **MCP-first** com integração nativa ao Claude.

## Visão geral

Backend NestJS + Postgres expondo um servidor MCP completo (87 tools cobrindo CRUD de toda a aplicação) + REST mínimo pra suportar o PWA. Foto de refeição é analisada pelo Claude e enviada como dados estruturados via MCP — o app não armazena imagens.

**Por que MCP-first?** Veja [`docs/ADR/006-mcp-first.md`](docs/ADR/006-mcp-first.md). Em resumo: o uso real do app é pelo Claude no celular, então toda funcionalidade está disponível por lá. O PWA é uma camada de visualização e edição pontual.

## Quick start

Pré-requisitos: Node 24+ (`nvm use`), Docker, e `corepack enable` (para o pnpm 9 pinado em `packageManager`).

```bash
git clone https://github.com/ThiagoCarreiraVallim/fatia.git
cd fatia
pnpm bootstrap   # uma vez: corepack + install + migrate + seed
pnpm dev         # diário: sobe postgres + logto + API + Web com hot reload
```

API em `http://localhost:3000`, Web em `http://localhost:3030`, MCP em `http://localhost:3000/mcp`.

Próximos passos:

- **Rodar e contribuir** → [`docs/ONBOARDING.md`](docs/ONBOARDING.md)
- **Subir o auth (Logto) local** → [`docs/LOCAL_AUTH.md`](docs/LOCAL_AUTH.md)
- **Testar MCP tools com Claude / clientes open-source** → [`docs/MCP_LOCAL.md`](docs/MCP_LOCAL.md)
- **Rodar o app nativo no celular** → [`apps/mobile/README.md`](apps/mobile/README.md)

## Documentação

| Arquivo                                          | Conteúdo                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md)       | Setup local, scripts, modos de desenvolvimento, troubleshooting                    |
| [`docs/LOCAL_AUTH.md`](docs/LOCAL_AUTH.md)       | Logto local: tenant, apps, API resource, `.env`                                    |
| [`docs/MCP_LOCAL.md`](docs/MCP_LOCAL.md)         | Registrar o MCP local no Claude Desktop / Code / clientes open-source + smoke test |
| [`docs/PRD.md`](docs/PRD.md)                     | Product Requirements — o que é o produto, escopo, não-escopo                       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)   | Arquitetura técnica, stack, decisões                                               |
| [`docs/DESIGN.md`](docs/DESIGN.md)               | UX, telas do PWA, fluxos                                                           |
| [`apps/mobile/README.md`](apps/mobile/README.md) | Rodar o app nativo localmente, configuração, troubleshooting                       |
| [`docs/MOBILE_PARITY.md`](docs/MOBILE_PARITY.md) | Paridade entre o app nativo e o PWA, rota a rota e componente a componente         |
| [`docs/MCP.md`](docs/MCP.md)                     | Especificação das tools MCP expostas                                               |
| [`docs/CLAUDE.md`](docs/CLAUDE.md)               | Instruções para o Claude trabalhando no código                                     |
| [`docs/TASKS.md`](docs/TASKS.md)                 | Ponteiro para o planejamento, que vive nas Issues                                  |
| [`docs/ADR/`](docs/ADR/)                         | Architecture Decision Records                                                      |

## Estrutura

```
fatia/
├── apps/
│   ├── api/           # NestJS (REST + MCP)
│   ├── web/           # Next.js PWA
│   ├── mobile/        # React Native (Expo) — réplica nativa do PWA
│   └── site/          # Astro — landing e documentação pública
├── packages/
│   ├── api-client/    # cliente de API compartilhado entre web e mobile
│   └── db/            # Prisma schema + client compartilhado
├── infra/             # docker-compose, scripts
└── docs/              # Documentação
```

`packages/api-client` existe para que o PWA e o app nativo falem com a API pelo **mesmo** código. O que muda entre eles é só o transporte: o web passa pelo proxy do Next (o token fica no servidor), o mobile chama direto com o Bearer do cofre do sistema.

## Stack

- **Backend:** NestJS, Prisma, Postgres 16, JWT
- **Frontend:** Next.js 15, Tailwind, shadcn/ui, Recharts
- **Mobile:** Expo SDK 57, Expo Router, NativeWind, react-native-svg
- **Infra:** Docker Compose no servidor próprio
- **MCP:** `@modelcontextprotocol/sdk` exposto via HTTP no NestJS

## Status

🚧 Em desenvolvimento — Fase 0 (setup).

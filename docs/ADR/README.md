# Architecture Decision Records

Decisões arquiteturais relevantes do projeto. Cada ADR é imutável depois de aceito — para mudar, cria-se um novo que supersede o anterior.

## Index

| #                                                              | Título                                                   | Status               |
| -------------------------------------------------------------- | -------------------------------------------------------- | -------------------- |
| [001](./001-monorepo-pnpm-turborepo.md)                        | Monorepo com pnpm + Turborepo                            | Accepted             |
| [002](./002-mcp-no-mesmo-processo.md)                          | MCP server no mesmo processo da API                      | Accepted             |
| [003](./003-auth-dupla-jwt-bearer.md)                          | Auth dupla: JWT (web) + Bearer (MCP)                     | ⚠️ Superseded by 008 |
| [004](./004-sem-armazenamento-fotos.md)                        | Sem armazenamento de fotos de refeição                   | Accepted             |
| [005](./005-taco-sem-usda-v1.md)                               | TACO como única base nutricional na v1                   | Accepted             |
| [006](./006-mcp-first.md)                                      | MCP como interface primária e completa                   | Accepted             |
| [007](./007-passos-manuais-com-schema-preparado.md)            | Passos manuais na v1, integrações preparadas mas adiadas | Accepted             |
| [008](./008-logto-oidc-provider.md)                            | Logto como provider OIDC, substituindo auth manual       | Accepted             |
| [009](./009-metas-nutricionais-personalizadas.md)              | Metas de nutrição personalizadas (nutrientes via Json)   | Accepted             |
| [010](./010-row-level-security.md)                             | Row-Level Security no Postgres: não agora                | Accepted             |
| [011](./011-dcr-vs-cimd.md)                                    | DCR com poda de clientes abandonados, em vez de CIMD     | Accepted             |
| [012](./012-graficos-no-mobile.md)                             | Gráficos do app nativo com react-native-svg, sem Skia    | Accepted             |
| [013](./013-roadmap-supera-escopo-negativo-v1.md)              | O roadmap pós-MVP supera o escopo negativo da v1         | Accepted             |
| [014](./014-compartilhamento-b2b-copia-e-vinculo.md)           | B2B: cópia na ida, vínculo consentido na volta           | Accepted             |
| [015](./015-agente-python-langgraph-cliente-mcp.md)            | Agente de IA em Python/LangGraph, cliente do MCP         | Accepted             |
| [016](./016-sem-expansao-internacional-da-base-nutricional.md) | Sem expansão internacional da base nutricional           | Accepted             |

## Template

Use `_template.md` ao criar uma nova ADR.

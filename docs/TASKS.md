# Planejamento

> O planejamento do Fatia vive nas **[Issues do GitHub](https://github.com/ThiagoCarreiraVallim/fatia/issues)**, não neste arquivo.

Este documento era um checklist de 700 linhas mantido à mão. Ele parou de ser confiável: marcava como pendente coisa entregue há meses (`WorkoutPlanService`, os endpoints REST de treino, as 30 tools MCP de treino, os testes de isolamento por usuário, o servidor de produção) e não tinha como registrar o que estava travado, em quem, ou por quê.

Um checklist que erra o estado é pior que nenhum: quem lê acredita.

A migração para Issues é o que a [#37](https://github.com/ThiagoCarreiraVallim/fatia/issues/37) pede.

## Onde cada coisa está agora

O trabalho é organizado em **épicas**, cada uma com sub-issues nativas do GitHub — o painel de progresso da épica é gerado automaticamente a partir delas.

| Épica                                                            | Assunto                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [#38](https://github.com/ThiagoCarreiraVallim/fatia/issues/38)   | Conector oficial do Claude — OAuth, isolamento, hardening, tools, LGPD, marketing, submissão |
| [#132](https://github.com/ThiagoCarreiraVallim/fatia/issues/132) | Réplica do frontend em React Native                                                          |
| [#133](https://github.com/ThiagoCarreiraVallim/fatia/issues/133) | Fundação de IA — Cloudflare AI Gateway, custo e privacidade                                  |
| [#137](https://github.com/ThiagoCarreiraVallim/fatia/issues/137) | Nutrição com IA — foto, código de barras, voz, porção                                        |
| [#143](https://github.com/ThiagoCarreiraVallim/fatia/issues/143) | Treino inteligente — prescrição adaptativa e periodização                                    |
| [#146](https://github.com/ThiagoCarreiraVallim/fatia/issues/146) | Engajamento — streaks, conquistas, notificações                                              |
| [#149](https://github.com/ThiagoCarreiraVallim/fatia/issues/149) | Dados e integrações — base internacional e wearables                                         |
| [#152](https://github.com/ThiagoCarreiraVallim/fatia/issues/152) | Camada B2B — grupos, academias, papéis e cobrança                                            |
| [#163](https://github.com/ThiagoCarreiraVallim/fatia/issues/163) | BYO-AI — o usuário traz a própria IA                                                         |

## Itens que estavam pendentes aqui e viraram issue

| Era                                              | Virou                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| FX.5 — configurar o tenant do Logto              | [#114](https://github.com/ThiagoCarreiraVallim/fatia/issues/114)                |
| FX.9 — validar o fluxo no Claude                 | item restante da [#91](https://github.com/ThiagoCarreiraVallim/fatia/issues/91) |
| F2.5 — reordenar exercícios do plano no PWA      | [#115](https://github.com/ThiagoCarreiraVallim/fatia/issues/115)                |
| F3.5 — editar e apagar logs de peso e passos     | [#116](https://github.com/ThiagoCarreiraVallim/fatia/issues/116)                |
| F4.1 — testar instalação do PWA em iOS e Android | item da [#96](https://github.com/ThiagoCarreiraVallim/fatia/issues/96)          |

O restante já estava entregue e foi verificado no código antes desta substituição — FX.1, FX.6, FX.10, F2.2, F2.3, F2.4, T.2 e T.3.

## O que continua valendo como documentação

Decisão de arquitetura vai para [`docs/ADR/`](./ADR), não para issue. Issue registra trabalho; ADR registra por que o sistema é do jeito que é.

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — desenho do sistema
- [`PRD.md`](./PRD.md) — produto
- [`MCP.md`](./MCP.md) — catálogo de tools, verificado por teste em `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`
- [`ONBOARDING.md`](./ONBOARDING.md) — subir o projeto localmente
- [`OPERATIONS.md`](./OPERATIONS.md) — runbook de produção e recuperação de desastre

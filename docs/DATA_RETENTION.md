# Retenção de dados e logging

> Entregável da issue #95 (frente 5 da épica #38). Documenta o que o Fatia guarda, por quanto
> tempo, e — igualmente importante — **o que não guarda**. A Política de Privacidade, servida em
> `/privacy`, aponta para cá para os detalhes técnicos.

## Dados do usuário

| Dado                                                 | Onde     | Retenção                 |
| ---------------------------------------------------- | -------- | ------------------------ |
| Perfil (`User`)                                      | Postgres | Enquanto a conta existir |
| Metas de macros (`UserGoals`)                        | Postgres | Enquanto a conta existir |
| Metas de nutrientes (`NutrientTarget`)               | Postgres | Enquanto a conta existir |
| Metas pessoais (`Goal`)                              | Postgres | Enquanto a conta existir |
| Refeições e itens (`Meal`, `MealItem`)               | Postgres | Enquanto a conta existir |
| Alimentos custom (`Food` com `createdByUserId`)      | Postgres | Enquanto a conta existir |
| Exercícios custom (`Exercise` com `createdByUserId`) | Postgres | Enquanto a conta existir |
| Planos, sessões e séries de treino                   | Postgres | Enquanto a conta existir |
| Peso, passos, hidratação                             | Postgres | Enquanto a conta existir |

**Não há expiração automática.** O histórico é o produto: um registro de peso de dois anos atrás
é exatamente o que dá valor ao gráfico de progresso. Apagar por idade seria destruir a
funcionalidade.

Ao apagar a conta, tudo acima vai embora imediatamente, pelos `onDelete: Cascade` a partir de
`User` em `packages/db/prisma/schema.prisma`. Não há soft delete, não há lixeira, não há período
de carência.

## Dados que NÃO são armazenados

- **Fotos de refeição.** Decisão registrada na [ADR 004](./ADR/004-sem-armazenamento-fotos.md).
  Quando o usuário fotografa um prato para o Claude analisar, a imagem é processada no lado do
  Claude; o Fatia recebe só o resultado textual. Não há bucket, não há upload, não há EXIF.
- **Senhas.** Removidas na [ADR 008](./ADR/008-logto-oidc-provider.md) — a migration
  `20260510190000_logto_auth_adr008` dropou a coluna `passwordHash`. A credencial vive no Logto.
- **Meios de pagamento.** A instância pública é gratuita.
- **Localização, contatos, agenda** ou qualquer dado do dispositivo.

## Autenticação e OAuth

| Dado                                                         | Onde                                                                 | Retenção                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Identidade, senha, sessões                                   | Logto (self-hosted)                                                  | Regido pelo Logto; apagada junto da conta quando a Management API está configurada |
| `McpOAuthClient` — clientes registrados via DCR              | Postgres                                                             | Enquanto o cliente existir. Sem expiração automática hoje                          |
| `McpOAuthAuthorization` — códigos de autorização em trânsito | Postgres                                                             | **Efêmero.** Tem `expiresAt` e `consumedAt`; o código é de uso único               |
| Access/refresh tokens                                        | **Não armazenados.** Emitidos pelo Logto, guardados pelo cliente MCP | —                                                                                  |

> **Pendência conhecida:** não há job de limpeza que apague fisicamente as linhas de
> `McpOAuthAuthorization` já expiradas ou consumidas. Elas não dão acesso a nada — a validação
> checa `expiresAt` e `consumedAt` — mas acumulam. Rastreado na issue #91.

## O que é registrado em log

Logs de aplicação, no stdout do container (coletados pelo Docker/Dokploy).

**Registrado a cada chamada de tool MCP** (`apps/api/src/mcp/mcp-tool.registry.ts`):

- nome da tool
- `userId` (UUID interno, não o e-mail)
- duração em ms
- sucesso ou falha
- categoria do erro (`NOT_FOUND`, `CONFLICT`, …)

**Não registrado:**

- o input da tool — ou seja, **nada do que o usuário comeu, pesou ou treinou aparece em log**
- o output da tool
- e-mail, nome ou qualquer identificador direto
- tokens, secrets ou headers de autorização

A mensagem de erro original é logada (`error: err.message`), o que exige cuidado ao escrever
exceptions: **mensagem de exception não deve embutir dado do usuário**. As mensagens atuais são
genéricas (`"Meal not found"`, `"Session not found"`) por essa razão.

No log de deleção de conta (`account.service.ts`) só vão `userId` e se a identidade do Logto foi
apagada — deliberadamente sem e-mail nem nome, porque um log não deve sobreviver ao dado que
acabou de ser eliminado.

### Retenção dos logs

Governada pela configuração do Docker no host, não pela aplicação. O default do driver
`json-file` é sem rotação — o que significa crescimento indefinido. Definir `max-size` e
`max-file` (ou enviar para um coletor com retenção explícita) faz parte da issue #39
(observabilidade).

## Backups

`infra/backup.sh` faz `pg_dumpall` diário (cron `0 4 * * *`) com retenção de **7 dias**.

Consequência a registrar com honestidade: **um dado apagado pode sobreviver até 7 dias nos
backups.** Isso é aceitável e usual — a LGPD admite retenção em backup por período razoável — mas
significa que "eliminação imediata" vale para o banco em produção, não para as cópias de
segurança, que rotacionam.

O envio dos backups para storage offsite cifrado é acompanhado na issue #93.

## Como o usuário exerce os direitos

| Direito (LGPD art. 18)     | Como                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| Acesso e portabilidade     | `GET /users/me/export` ou a tool MCP `export_my_data`                       |
| Correção                   | Qualquer tool de `update_*`, ou a própria UI                                |
| Eliminação                 | `DELETE /users/me` ou a tool `delete_my_account`, com confirmação explícita |
| Revogação do consentimento | Apagar a conta                                                              |

Nenhum deles depende de abrir um pedido ou esperar resposta humana — é o que a instrumentação
via MCP permite: o usuário pede ao Claude e acontece.

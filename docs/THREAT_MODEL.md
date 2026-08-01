# Threat model — isolamento multi-tenant

> Entregável da issue #92 (frente 2 da épica #38). O Fatia hospedado é multi-tenant: uma
> única instância, um único Postgres, dados de saúde de vários usuários. Este doc descreve o
> que protege o quê, e o que **não** está protegido.

## Ativos

Dados de saúde vinculados a uma pessoa: refeições e o que ela come, peso corporal, treinos e
cargas, passos, hidratação, metas. Não são dados triviais — o histórico de peso e alimentação
de alguém é sensível, e a LGPD trata dado de saúde como categoria especial.

Não armazenamos: fotos (ADR 004), senhas (ADR 008 — a identidade vive no Logto), meios de
pagamento.

## Camadas de defesa

| Camada                  | O que faz                                                                 | Onde                                                       |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Transporte              | HTTPS obrigatório, redirect HTTP→HTTPS, Let's Encrypt via Traefik         | `infra/docker-compose.prod.yml`                            |
| Autenticação            | JWT do Logto validado por assinatura (JWKS), `iss`, `aud`, `exp`, `sub`   | `apps/api/src/auth/jwt-validation.service.ts`              |
| Guard global            | `JwtAuthGuard` como `APP_GUARD` — rota sem opt-out explícito exige token  | `apps/api/src/auth/auth.module.ts`                         |
| Resolução de identidade | `sub` do JWT → `User` local; provisioning lazy no primeiro login          | `apps/api/src/auth/user-provisioning.service.ts`           |
| Injeção de identidade   | `@CurrentUser()` nos controllers; `McpToolContext.userId` nas tools       | `apps/api/src/common/decorators/current-user.decorator.ts` |
| Escopo de query         | Todo service filtra por `userId`; posse verificada antes de mutar         | ver matriz abaixo                                          |
| Integridade referencial | `onDelete: Cascade` de `User` para tudo que é dele; índices `[userId, X]` | `packages/db/prisma/schema.prisma`                         |
| Rate limit              | 60 req/min por usuário no `/mcp`, chaveado por `user.id`                  | `apps/api/src/mcp/mcp-throttler.guard.ts`                  |
| SQL injection           | Prisma parametriza tudo; não há SQL cru em nenhum service                 | —                                                          |

## Vetores e mitigação

### 1. Token de outro usuário

Um JWT roubado dá acesso pleno à conta. Mitigação: expiração curta e refresh no Logto, HTTPS
obrigatório, sem token estático (removidos na ADR 008 — antes existiam bearer tokens MCP de
vida longa, que eram exatamente esse risco).

**Não mitigado:** não há revogação proativa de sessão pelo lado do Fatia — a revogação é
delegada ao Logto. Ver a decisão pendente sobre RFC 7009 na issue #91.

### 2. IDOR — pedir o ID de outra pessoa

O principal vetor. Um usuário autenticado tem token válido; nada impede ele de chutar IDs.

Mitigação em duas partes:

- **Escopo na query.** Nenhum service confia no ID sozinho — ou o `where` inclui `userId`, ou
  há verificação de posse antes de mutar.
- **Resposta indistinguível.** `NOT_FOUND` tanto para "não existe" quanto para "não é seu".

A segunda parte era um **furo real até a #92**: os caminhos de escrita devolviam `403
Forbidden` para recurso de outro usuário e `404` para inexistente. Isso é um oráculo de
existência — e crítico nos IDs **inteiros sequenciais** de `Food` e `Exercise`, onde um
atacante podia varrer `1..N` e mapear quantos alimentos e exercícios custom existem em outras
contas, inclusive pelos nomes em mensagens de erro. Corrigido: as duas respostas agora são
idênticas.

Exceção deliberada: exercícios do **catálogo base** (`createdByUserId = null`) respondem
`CONFLICT` com mensagem explícita apontando `clone_exercise`. Não há existência a esconder —
o catálogo base é público e igual para todos — e a mensagem evita o cliente insistir.

### 3. `userId` vindo de fora

Se uma tool ou controller aceitasse `userId` por input, todo o resto viraria decoração.
Garantido estruturalmente por `apps/api/src/mcp/__tests__/tool-user-scoping.spec.ts`, que
falha se qualquer tool declarar campo de identidade no `inputSchema` ou se qualquer controller
usar `@Param('userId')` / `@Query('userId')` / `@Body('userId')`.

### 4. Atalho de admin

Existe `Role.ADMIN` no schema, mas **nenhum service consulta `role`** para ampliar escopo. Não
há bypass administrativo. Se algum dia houver, precisa de ADR — é o tipo de atalho que anula o
isolamento inteiro.

### 5. SQL injection

Prisma parametriza. Não há `$queryRaw`/`$executeRaw` em nenhum service. Se entrar SQL cru,
tem de vir com escopo explícito e teste.

### 6. Vazamento por log

Os logs de tool registram `tool`, `userId`, `durationMs`, `success` e `category` do erro — não
registram o input nem o output. Ver `docs/MCP.md` §Observabilidade.

### 7. Token no aparelho — o app nativo

O app React Native (`apps/mobile`) muda uma premissa que valia para os dois clientes
anteriores.

No PWA o access token **nunca chega ao navegador**: fica na sessão em cookie `httpOnly`, e o
proxy do Next injeta o `Authorization` no servidor. No conector MCP o token vive no Claude,
fora do nosso alcance. No app nativo **não existe servidor**: o token é guardado no aparelho.

O que isso acrescenta ao modelo:

| Vetor novo                     | Mitigação                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Leitura do token por outro app | Keychain (iOS) / Keystore (Android) via `expo-secure-store`. **Nunca `AsyncStorage`**, que é texto plano no sandbox                 |
| Token em backup do aparelho    | `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — o token não sai do aparelho nem por backup do iCloud                                             |
| Leitura com a tela bloqueada   | mesma opção: o item só é legível com o aparelho destravado                                                                          |
| Captura da senha pelo app      | login no navegador do sistema (`ASWebAuthenticationSession` / Custom Tabs). **Nunca WebView embutida**, onde o app leria o digitado |
| Interceptação do `code`        | PKCE S256 obrigatório; cliente público, sem `client_secret` — que num app distribuído seria extraível de qualquer forma             |
| Deep link sequestrado          | o `code` sozinho não vale nada sem o `code_verifier`, que nunca sai do processo                                                     |

**Não mitigado:**

- **Aparelho comprometido.** Em aparelho com root ou jailbreak, o cofre do sistema deixa de ser
  barreira. Não há defesa de aplicação contra isso — detecção de root é contornável e daria
  falsa sensação de garantia.
- **App clonado / repackaging.** Alguém pode reempacotar o app com o mesmo `client_id` e o mesmo
  `scheme` de deep link. O Logto não distingue, porque cliente público não tem segredo a
  provar. O que limita o dano é que o token continua exigindo o login legítimo da pessoa. A
  defesa real seria App Attest (iOS) / Play Integrity (Android), que ainda não está implantada.
- **Sem `scheme` exclusivo verificado.** `fatia://` é registrado por convenção, não por
  propriedade verificada de domínio. Universal Links (iOS) e App Links (Android) resolveriam,
  ao custo de hospedar os arquivos de associação — fica como dívida da issue #131.

Os limites do que sobrevive a um refresh estão em `apps/mobile/src/auth/session-manager.ts`:
só `invalid_grant` encerra a sessão; falha de rede preserva o que está guardado. É deliberado —
derrubar o login por conexão ruim empurraria a pessoa a autenticar de novo em rede hostil.

## Matriz de cobertura

Onde o escopo é aplicado, por domínio. Verificado por
`apps/api/src/common/__tests__/user-isolation.spec.ts` (51 casos contra Postgres real: semeia
como user-A, tenta ler/editar/apagar como user-B).

**Atenção ao caso que faltava.** Até a correção do `reorderExercises`, todos os casos de escrita
mandavam o recurso do user-A **na URL**, e o `assertOwner` barrava. Nenhum cobria a forma em que o
atacante manda um recurso **próprio** na URL — legítimo, passa no `assertOwner` — e o id alheio no
**corpo**. Endpoint que aceita id de recurso filho no payload precisa amarrá-lo ao pai da URL; ser
dono do pai não autoriza escrever em qualquer filho.

| Domínio             | Service                                       | Ponto de escopo                                                            |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Refeições           | `meal.service.ts`                             | `where: { userId }` nas leituras; `assertOwner` nas escritas               |
| Itens de refeição   | `meal-item.service.ts`                        | posse via `item.meal.userId` / `meal.userId`                               |
| Alimentos custom    | `food.service.ts`                             | `OR: [createdByUserId: null, createdByUserId: userId]`; custom exige posse |
| Metas de nutriente  | `nutrient-target.service.ts`                  | `where: { userId }`; unique `[userId, nutrientKey]`                        |
| Metas de macros     | `user-goals.service.ts`                       | `UserGoals.userId` é a própria PK                                          |
| Metas pessoais      | `goals.service.ts`                            | `where: { userId }`; `assertOwned` nas escritas                            |
| Peso                | `weight-log.service.ts`                       | `where: { userId }`; posse no update/delete                                |
| Passos              | `step-log.service.ts`                         | idem                                                                       |
| Hidratação          | `water-log.service.ts`                        | idem                                                                       |
| Exercícios          | `exercise.service.ts`                         | `accessFilter(userId)`; custom exige posse; base é só-leitura              |
| Planos              | `workout-plan.service.ts`                     | `where: { userId }`; `assertOwner`                                         |
| Sessões             | `workout-session.service.ts`                  | `where: { userId }`; `assertOwner`; delete idempotente                     |
| Séries              | `session-set.service.ts`                      | posse via `set.session.userId`                                             |
| Progresso/dashboard | `progress.service.ts`, `dashboard.service.ts` | agregam sobre queries já escopadas                                         |
| Grupos de alimento  | `food.service.ts#listGroups`                  | **sem escopo, de propósito** — `FoodGroup` não tem dono                    |

## O que não está protegido

- **Sem Row-Level Security no Postgres.** O isolamento é 100% na aplicação: um bug de código
  que esqueça o `userId` vaza dado, e o banco não segura. Decisão registrada na
  [ADR 010](./ADR/010-row-level-security.md).
- **Sem revogação de sessão do lado do Fatia** (ver vetor 1).
- **Sem auditoria de acesso.** Não há trilha de "quem leu o quê" além dos logs de tool.
- **Ordem de argumentos inconsistente** entre services (`userId` às vezes primeiro, às vezes
  último). Não é vulnerabilidade, mas é uma pegadinha: trocar a ordem numa chamada nova passa
  pelo TypeScript quando os dois são `string`. Padronizar é dívida técnica aberta.

## Como manter

Três testes sustentam este doc. Quebrar qualquer um deles é sinal de regressão de isolamento:

1. `apps/api/src/common/__tests__/user-isolation.spec.ts` — comportamento, contra Postgres real.
2. `apps/api/src/mcp/__tests__/tool-user-scoping.spec.ts` — estrutura, sem banco.
3. Os specs por service, que provam que o `where` é montado com `userId`.

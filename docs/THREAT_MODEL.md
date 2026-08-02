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
| Leitura entre contas    | `ProfessionalLink` consentido pelo titular, resolvido por um método só    | `apps/api/src/sharing/professional-access.service.ts`      |
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

**Corrigido na #215:** o serializador padrão do `pino-http` gravava **todos os cabeçalhos** da
requisição — `authorization` e `cookie` inclusive — e a URL com query string. Ou seja, o token de
acesso de cada usuário estava indo para o log a cada requisição, contradizendo o parágrafo acima.
O log passou a ser por **lista de permissão**: só saem `user-agent`, `content-type`,
`content-length` e `referer`, mais `method`, `path` **sem query** e `statusCode`. Ver
`apps/api/src/common/log-serializers.ts` e o teste `__tests__/log-serializers.spec.ts`, que abre
com um controle negativo exercitando o serializador padrão do pino.

**Ajuste da #39:** com o envio ao Loki o log deixa de morar só no `docker logs`. Duas
consequências. A primeira é que o defeito acima ficaria pior — o token passaria a ser indexado e
guardado num segundo lugar, com retenção própria; três trabalhos independentes encontraram o
mesmo vazamento ao instrumentar. A segunda é o `remoteAddress`, que **saiu** do serializador:
IP é dado pessoal, e atrás do Traefik o valor é o do proxy — igual em toda requisição, sem ganho
diagnóstico que compense indexá-lo. É a mesma decisão que a redação de span já toma para
`client.address` e `network.peer.address` (§6b); mantê-lo no log era redigir a mesma informação
numa camada e publicá-la na outra.

### 6b. Telemetria — trace e métrica

Mesma regra do vetor 6, num store novo: registra-se **a forma** da operação, nunca o conteúdo.
Nome de alimento, peso corporal, carga de treino e conteúdo de refeição não entram em span nem em
métrica.

O comportamento pronto de fábrica do OpenTelemetry é **errado para este produto**: a
instrumentação de HTTP preenche `url.query` e `url.full` com a query string crua. Verificado
desligando a redação de propósito: `?search=whey%20isolado&peso=87.4&token=...` chegou inteiro ao
Tempo por `url.full`.

| Camada               | O que faz                                                                     | Onde                                                               |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Redação no processo  | remove `url.query`, cabeçalhos, `db.statement`, IP; corta query de `url.full` | `apps/api/src/observability/redacting-span-processor.ts`           |
| Redação no collector | mesma lista, fora do processo — vale para qualquer serviço que exporte ali    | `infra/observability/otel-collector.yml`                           |
| Guarda de rótulo     | teste falha se métrica ganhar rótulo fora da lista, ou com UUID/e-mail        | `apps/api/src/observability/__tests__/mcp-metrics.service.spec.ts` |

**`userId` não entra em span nem em métrica. Decisão consciente**, não esquecimento:

1. **O log já responde "quem".** O `mcp-tool.registry.ts` grava `userId` por chamada, e o log
   carrega o `trace_id`. Do trace se chega ao log; duplicar a identidade no Tempo não acrescenta
   resposta nenhuma.
2. **Cardinalidade.** Em métrica, um rótulo por usuário não dá erro: cria uma série por valor e
   faz o Prometheus crescer até morrer, semanas depois e longe da causa.
3. **Superfície.** Tempo e Prometheus não têm a disciplina de retenção e eliminação que o
   `docs/DATA_RETENTION.md` define para o banco. Dado ligado a pessoa ali é passivo, não
   ferramenta.

**Hash foi considerado e descartado:** um hash estável de `userId` continua sendo identificador
pessoal pseudonimizado (LGPD art. 13) e reintroduz o problema 2 por inteiro.

**Não mitigado:** o endpoint OTLP do collector não tem autenticação. Ele só é seguro porque não é
alcançável de fora — sem porta publicada e sem label de Traefik. Publicá-lo por engano expõe toda
a telemetria.

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

### 8. Acesso profissional — trainer malicioso e aluno que saiu do grupo

O B2B (#152) quebra a premissa de que **nenhum** usuário lê dado de outro. A
[ADR 014](./ADR/014-compartilhamento-b2b-copia-e-vinculo.md) escolheu o desenho que mantém o
estrago contido, e a #153 entregou o modelo.

Duas direções, dois mecanismos:

- **Profissional → aluno** não é leitura: é oferta de plano, e o aceite materializa uma **cópia
  sob o `userId` do aluno** (mesmo padrão de `clone_exercise`). Não há vínculo vivo a explorar.
- **Aluno → profissional** é a única leitura entre contas do produto, e passa por **um método
  só**: `ProfessionalAccessService.assertReadable`, que devolve o `userId` do titular. Todo
  service de domínio abaixo dele continua filtrando por `userId` e ignorando que grupo existe.

A camada do vínculo é conferida **nos dois lados, e por conta própria**. Antes de procurar o
`ProfessionalLink`, a porta exige que o aluno tenha membership `ACTIVE` no grupo e que o
profissional tenha membership `ACTIVE` com papel `PROFESSIONAL` **no mesmo grupo**. Nenhuma das
duas depende de a revogação em massa (`revokeAllForMemberOp`) ter rodado: quem sai do grupo — em
qualquer das duas pontas — para de ler e de ser lido no mesmo instante, mesmo com o vínculo ainda
marcado como vigente. Fosse só o lado do aluno, o personal demitido continuaria lendo o histórico
de saúde dela até alguém preencher `revokedAt` na mão.

| Vetor                                                     | Mitigação                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Profissional lê aluno com quem não tem vínculo            | `ProfessionalLink` é a única fonte de autorização. Sem linha ativa, `NOT_FOUND` idêntico ao de um estranho                           |
| Profissional continua lendo depois de revogado            | `revokedAt: null` no `where` da porta. Revogar nunca apaga a linha — a trilha de "quem teve acesso quando" sobrevive                 |
| Consentir treino e o profissional ler o diário alimentar  | Consentimento por escopo, conferido com `scopes: { has: scope }`. A assinatura aceita **um** escopo; `hasSome` com `[]` casaria tudo |
| Dono de academia (ou trainer) lê por ter papel no grupo   | Papel **não** autoriza leitura. `GroupRole` governa administração; leitura vem só do vínculo. Só `PROFESSIONAL` é papel elegível     |
| Aluno sai do grupo e continua sendo lido                  | `status: ACTIVE` da membership conferido na porta, além da revogação em massa dos vínculos do grupo                                  |
| Personal **demitido** continua lendo o aluno              | A porta exige membership `ACTIVE` com papel `PROFESSIONAL` **dos dois lados**, no grupo da linha. Não depende de `revokedAt` chegar  |
| Identidade do aluno passada por input (`student_id`)      | A porta recebe `membershipId`, nunca `userId`. `tool-user-scoping.spec.ts` recusa `student_id`, `subject_id`, `on_behalf_of` e cia.  |
| `membershipId` de outro contexto usado com vínculo válido | Titular e grupo saem da **linha de membership lida**, e o vínculo é procurado pelo trio. Id de input nunca autoriza sozinho (#204)   |

**Não mitigado:** um profissional com vínculo ativo e escopo consentido vê o dado — é o
propósito. O controle é do titular (revogar), e a trilha em `ProfessionalAccessLog` responde
depois. Não há detecção de uso anômalo dentro do que foi consentido.

## Matriz de cobertura

Onde o escopo é aplicado, por domínio. Verificado por
`apps/api/src/common/__tests__/user-isolation.spec.ts` (62 casos contra Postgres real: semeia
como user-A, tenta ler/editar/apagar como user-B). Desde a #153 o user-B é também **dono da
academia** em que o user-A é aluno — todos os casos de recusa passam a valer com ele nessa
posição, sem uma linha a mais.

**Atenção ao caso que faltava.** Até a correção do `reorderExercises`, todos os casos de escrita
mandavam o recurso do user-A **na URL**, e o `assertOwner` barrava. Nenhum cobria a forma em que o
atacante manda um recurso **próprio** na URL — legítimo, passa no `assertOwner` — e o id alheio no
**corpo**. Endpoint que aceita id de recurso filho no payload precisa amarrá-lo ao pai da URL; ser
dono do pai não autoriza escrever em qualquer filho.

| Domínio              | Service                                       | Ponto de escopo                                                            |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Refeições            | `meal.service.ts`                             | `where: { userId }` nas leituras; `assertOwner` nas escritas               |
| Itens de refeição    | `meal-item.service.ts`                        | posse via `item.meal.userId` / `meal.userId`                               |
| Alimentos custom     | `food.service.ts`                             | `OR: [createdByUserId: null, createdByUserId: userId]`; custom exige posse |
| Metas de nutriente   | `nutrient-target.service.ts`                  | `where: { userId }`; unique `[userId, nutrientKey]`                        |
| Metas de macros      | `user-goals.service.ts`                       | `UserGoals.userId` é a própria PK                                          |
| Metas pessoais       | `goals.service.ts`                            | `where: { userId }`; `assertOwned` nas escritas                            |
| Peso                 | `weight-log.service.ts`                       | `where: { userId }`; posse no update/delete                                |
| Passos               | `step-log.service.ts`                         | idem                                                                       |
| Hidratação           | `water-log.service.ts`                        | idem                                                                       |
| Exercícios           | `exercise.service.ts`                         | `accessFilter(userId)`; custom exige posse; base é só-leitura              |
| Planos               | `workout-plan.service.ts`                     | `where: { userId }`; `assertOwner`                                         |
| Sessões              | `workout-session.service.ts`                  | `where: { userId }`; `assertOwner`; delete idempotente                     |
| Séries               | `session-set.service.ts`                      | posse via `set.session.userId`                                             |
| Progresso/dashboard  | `progress.service.ts`, `dashboard.service.ts` | agregam sobre queries já escopadas                                         |
| Grupos de alimento   | `food.service.ts#listGroups`                  | **sem escopo, de propósito** — `FoodGroup` não tem dono                    |
| Leitura profissional | `sharing/professional-access.service.ts`      | `assertReadable` resolve o titular; a **única** leitura entre contas       |

## O que não está protegido

- **Sem Row-Level Security no Postgres.** O isolamento é 100% na aplicação: um bug de código
  que esqueça o `userId` vaza dado, e o banco não segura. Decisão registrada na
  [ADR 010](./ADR/010-row-level-security.md).
- **Sem revogação de sessão do lado do Fatia** (ver vetor 1).
- **Auditoria de acesso só no caminho profissional.** `ProfessionalAccessLog` registra toda
  tentativa de leitura entre contas — inclusive as **negadas**, que são o registro que denuncia
  profissional malicioso. Leitura do usuário sobre o próprio dado continua sem trilha, e não há
  intenção de criar uma: seriam milhões de linhas para responder "eu li o meu".
- **Sondar `membershipId` inexistente é a única batida invisível na porta profissional.** Quando a
  linha de `GroupMembership` não existe, `assertReadable` recusa **antes** de gravar, e de
  propósito: `ProfessionalAccessLog.subjectUserId` é FK não-nula, então registrar exigiria inventar
  um titular — e trilha apontando para a pessoa errada é pior que trilha ausente. A consequência
  aceita é que enumerar ids não deixa rastro. Toda tentativa contra uma membership que **existe**
  fica registrada, com `denied: true`, mesmo quando o profissional foi removido do grupo. Fechar
  isto exigiria um `subjectUserId` opcional ou uma tabela de sondagem à parte; nenhuma das duas
  tem issue aberta.
- **Ordem de argumentos inconsistente** entre services (`userId` às vezes primeiro, às vezes
  último). Não é vulnerabilidade, mas é uma pegadinha: trocar a ordem numa chamada nova passa
  pelo TypeScript quando os dois são `string`. Padronizar é dívida técnica aberta.

## Como manter

Três testes sustentam este doc. Quebrar qualquer um deles é sinal de regressão de isolamento:

1. `apps/api/src/common/__tests__/user-isolation.spec.ts` — comportamento, contra Postgres real.
2. `apps/api/src/mcp/__tests__/tool-user-scoping.spec.ts` — estrutura, sem banco.
3. Os specs por service, que provam que o `where` é montado com `userId`.

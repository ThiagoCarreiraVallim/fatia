# Threat model — isolamento multi-tenant

> Entregável da issue #92 (frente 2 da épica #38). O Fatia hospedado é multi-tenant: uma
> única instância, um único Postgres, dados de saúde de vários usuários. Este doc descreve o
> que protege o quê, e o que **não** está protegido.

## Ativos

Dados de saúde vinculados a uma pessoa: refeições e o que ela come, peso corporal, treinos e
cargas, passos, hidratação, metas. Não são dados triviais — o histórico de peso e alimentação
de alguém é sensível, e a LGPD trata dado de saúde como categoria especial.

Desde a #249 há mais um, e ele é de outra natureza: o **texto da conversa com a IA hospedada**
(`Conversation`/`Message`). As outras tabelas guardam número — 80 kg, 1.800 kcal. Esta guarda o
que a pessoa **escreveu**, em prosa, e é onde aparecem o remédio, o diagnóstico e o medo. Vale a
mesma regra do §6: não entra em log, em span nem em mensagem de erro. O mesmo diálogo existe num
segundo formato — o **checkpoint** do agente, no schema `agent_checkpoint` do mesmo Postgres, com as
chamadas de tool e os resultados que o `/mcp` devolveu ([ADR 023](./ADR/023-checkpointer-no-postgres-da-fatia.md))
— e as **memórias** (`UserMemory`), que a pessoa pediu para o assistente guardar. Os três têm a
mesma sensibilidade, e o vetor 10 descreve o que os protege.

Não armazenamos: fotos (ADR 004), senhas (ADR 008 — a identidade vive no Logto), meios de
pagamento.

## Camadas de defesa

| Camada                  | O que faz                                                                    | Onde                                                                |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Transporte              | HTTPS obrigatório, redirect HTTP→HTTPS, Let's Encrypt via Traefik            | `infra/docker-compose.prod.yml`                                     |
| Autenticação            | JWT do Logto validado por assinatura (JWKS), `iss`, `aud`, `exp`, `sub`      | `apps/api/src/auth/jwt-validation.service.ts`                       |
| Guard global            | `JwtAuthGuard` como `APP_GUARD` — rota sem opt-out explícito exige token     | `apps/api/src/auth/auth.module.ts`                                  |
| Resolução de identidade | `sub` do JWT → `User` local; provisioning lazy no primeiro login             | `apps/api/src/auth/user-provisioning.service.ts`                    |
| Injeção de identidade   | `@CurrentUser()` nos controllers; `McpToolContext.userId` nas tools          | `apps/api/src/common/decorators/current-user.decorator.ts`          |
| Escopo de query         | Todo service filtra por `userId`; posse verificada antes de mutar            | ver matriz abaixo                                                   |
| Leitura entre contas    | `ProfessionalLink` consentido pelo titular, resolvido por um método só       | `apps/api/src/sharing/professional-access.service.ts`               |
| Papel de grupo          | Matriz fechada por ação; guarda de rota administrativa. **Não** lê dado      | `apps/api/src/sharing/permissions.ts`, `guards/group-role.guard.ts` |
| Trilha de acesso        | Toda leitura entre contas registrada, negativas inclusive, antes da resposta | `apps/api/src/sharing/access-audit.service.ts`                      |
| Integridade referencial | `onDelete: Cascade` de `User` para tudo que é dele; índices `[userId, X]`    | `packages/db/prisma/schema.prisma`                                  |
| Rate limit              | 60 req/min por usuário no `/mcp`, chaveado por `user.id`                     | `apps/api/src/mcp/mcp-throttler.guard.ts`                           |
| SQL injection           | Prisma parametriza; o único SQL cru com valor é a purga do checkpoint        | `apps/api/src/chat/checkpoint-purge.service.ts`                     |

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

**O B2B não abriu essa porta.** `Role.ADMIN` é papel de **plataforma** e não aparece em
`apps/api/src/sharing/permissions.ts`, que só conhece os quatro `GroupRole`. E o `GroupRole` do
grupo governa **administração** — aprovar entrada, remover membro, ver fatura —, nunca leitura de
dado: quem autoriza ler é o `ProfessionalLink` que o titular criou, e `assertReadable` não consulta
`Role` nenhum. Papel de grupo acumulado também não ajuda: `@@unique([groupId, userId])` garante um
papel por pessoa por grupo. A matriz está em [`PERMISSIONS.md`](./PERMISSIONS.md) e é confrontada
com o código por `apps/api/src/sharing/__tests__/permission-matrix.spec.ts`.

### 5. SQL injection

Prisma parametriza. O único SQL cru que recebe valor é `checkpoint-purge.service.ts`, que apaga as
threads do agente num schema que o Prisma não conhece (vetor 10): o nome da tabela vem de uma
constante do próprio arquivo, e o `userId`/`conversationId` vai **sempre** como parâmetro. O
escopo por pessoa é pelo prefixo exato do `thread_id` (`split_part(thread_id, ':', 1) = $1`), e não
por `LIKE` — o `_` é curinga no `LIKE`, e um id com ele casaria com threads de outra pessoa. O teste
(`conversation-persistence.spec.ts`) semeia threads de duas pessoas e confere que só as de uma
somem. O outro `$queryRaw` é o `SELECT 1` do health check. SQL cru novo tem de vir com escopo
explícito e teste, como este.

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

| Vetor                                                         | Mitigação                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profissional lê aluno com quem não tem vínculo                | `ProfessionalLink` é a única fonte de autorização. Sem linha ativa, `NOT_FOUND` idêntico ao de um estranho                                                                                 |
| Profissional continua lendo depois de revogado                | `revokedAt: null` no `where` da porta. Revogar nunca apaga a linha — a trilha de "quem teve acesso quando" sobrevive                                                                       |
| Consentir treino e o profissional ler o diário alimentar      | Consentimento por escopo, conferido com `scopes: { has: scope }`. A assinatura aceita **um** escopo; `hasSome` com `[]` casaria tudo                                                       |
| Dono de academia (ou trainer) lê por ter papel no grupo       | Papel **não** autoriza leitura. `GroupRole` governa administração; leitura vem só do vínculo. Só `PROFESSIONAL` é papel elegível                                                           |
| Aluno sai do grupo e continua sendo lido                      | `status: ACTIVE` da membership conferido na porta, além da revogação em massa dos vínculos do grupo                                                                                        |
| Personal **demitido** continua lendo o aluno                  | A porta exige membership `ACTIVE` com papel `PROFESSIONAL` **dos dois lados**, no grupo da linha. Não depende de `revokedAt` chegar                                                        |
| Identidade do aluno passada por input (`student_id`)          | A porta recebe `membershipId`, nunca `userId`. `tool-user-scoping.spec.ts` recusa `student_id`, `subject_id`, `on_behalf_of` e cia.                                                        |
| `membershipId` de outro contexto usado com vínculo válido     | Titular e grupo saem da **linha de membership lida**, e o vínculo é procurado pelo trio. Id de input nunca autoriza sozinho (#204)                                                         |
| Leitura acontece e a trilha não registra                      | `record` é **aguardado** antes de a resposta sair, e falha de escrita **derruba a leitura** (`503`). Ler sem registro é o pior resultado, e é o que a versão anterior permitia em silêncio |
| Titular não sabe quem o vê, nem consegue cortar               | `list_data_sharing`, `grant_data_sharing`, `revoke_data_sharing` e `list_data_access_log` (#155). O consentimento é operável pelo próprio titular, categoria por categoria                 |
| Alguém consente pelo aluno (dono da academia, o profissional) | `subjectUserId` sai sempre do contexto autenticado. `professionalLink.create` existe em **um** arquivo, verificado por teste estrutural                                                    |

**Não mitigado:** um profissional com vínculo ativo e escopo consentido vê o dado — é o
propósito. O controle é do titular (revogar), e a trilha em `ProfessionalAccessLog` responde
depois. Não há detecção de uso anômalo dentro do que foi consentido.

**A revogação vale a partir da requisição seguinte.** A checagem acontece no início da
requisição, então revogar no meio de uma leitura em voo não cancela aquela resposta. A janela é de
**uma** requisição, e é isso que `/privacy` promete — em vez de "instantâneo", que seria mentira.

### 9. Reidentificação por agregado — o painel do dono

O painel de retenção (#159) e o de comportamento (#160) entregam número ao **dono da academia**,
que não tem — e nunca terá — vínculo com aluno nenhum. O vetor aqui não é ler o que não devia: é
**deduzir o indivíduo a partir de números que, um a um, parecem inofensivos**.

A definição completa, com o limiar, a regra complementar e a lista fechada de eixos, está em
[`AGGREGATION_POLICY.md`](./AGGREGATION_POLICY.md) — publicada de propósito, porque uma promessa
de anonimização que não pode ser conferida não vale nada.

| Vetor                                                            | Mitigação                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorte estreito até sobrar uma pessoa ("alunas, 30-35, manhã")  | Não existe construtor de filtro: a API recebe o **nome** de um recorte registrado, um eixo por consulta, sem atributo demográfico                                                                     |
| Célula suprimida recalculada pelo total menos as visíveis        | Supressão **complementar** por bloco: ≥ 2 células ocultas, `n` somado ≥ `MIN_CELL` e folga de valor ≥ `MIN_CELL`; e o total não é publicado                                                           |
| Duas células pequenas que "se bastam" (resíduo 2, 1 + 1)         | É a folga de valor da linha acima. Sem ela, cada parcela valia 1 e as duas voltavam exatas — o bloqueio que a revisão da PR #240 exibiu                                                               |
| Mesma célula publicada por outra janela do mesmo catálogo        | O bloco cresce para a **direita** e é montado por semente: ele é função da semente e do que está à direita dela, e as três janelas terminam em `now`. Oculto na janela curta continua oculto na longa |
| Balde vazio usado como complemento                               | O complemento exige `n > 0` — zero é valor conhecido, e a subtração continuaria com uma incógnita só                                                                                                  |
| Janela de datas estreitada até isolar uma sessão                 | Período também é nomeado (`last_30_days`, `last_90_days`, `last_12_months`). `from`/`to` livre é construtor de filtro com outro nome                                                                  |
| Chave da célula suprimida carregando texto do aluno              | O limiar zera `value` e `n`, **não** a chave. Todo eixo é lista fechada: `muscleGroup` fora da lista canônica vira `outros`                                                                           |
| Dado de saúde entrando no agregado ("quem parou de perder peso") | Só engajamento é métrica ou eixo. `no-body-data.spec.ts` varre `insights/` e reprova `weightLog`, `meal`, `goal`, `foodGroup`, `bodyFat` e cia.                                                       |
| Quem não consentiu contado no denominador                        | O denominador é só de quem deu opt-in (`GroupMembership.statsOptIn`). Numerador consentido sobre denominador cheio informa sobre quem recusou                                                         |
| Supressão aplicada só na UI                                      | `suppress()` roda no servidor e o campo sai `null` — inclusive o `n`. Teste serializa a resposta e procura o número                                                                                   |
| Export do painel ignorando a supressão da tela                   | O export recebe as **mesmas células já suprimidas** e não tem `PrismaService` no construtor: não há como fazer a segunda consulta                                                                     |
| Segundo caminho de agregação nascendo no painel pago             | `single-aggregation-path.spec.ts`: um único arquivo importa `suppress`, um único arquivo define o limiar, todo recorte vem do catálogo                                                                |
| Add-on pago conferido só na tela                                 | `InsightsAddonGuard` na rota, respondendo `NOT_FOUND` (não `402`) para grupo sem o add-on                                                                                                             |
| Lista de "alunos em risco" chegando ao dono                      | O sinal é contagem por faixa. Não existe estrutura com id de pessoa saindo do módulo — não é escondida, não existe                                                                                    |

**Não mitigado:** supressão com limiar **não é privacidade diferencial**. Comparar duas células
**visíveis** de períodos diferentes em que entrou exatamente uma pessoa revela essa pessoa, e o
bloco estreita — sem revelar — o intervalo do valor oculto: ele garante `MIN_CELL` valores
possíveis para cada parcela, não infinitos. As duas limitações estão escritas em
`AGGREGATION_POLICY.md`, na seção "O que não está protegido". Ruído diferencial foi considerado e
descartado: sem orçamento de privacidade por consulta e contabilidade de composição, é ruído que
dá falsa sensação de garantia, e não é auditável por quem lê o código — que é metade do valor,
já que a metodologia é publicada.

### 10. O chat hospedado — o Bearer atravessando o agente, e o estado que ele guarda

Até a #249 o `apps/agent` **deliberadamente não recebia** token de usuário; o docstring de
`apps/agent/src/fatia_agent/api.py` registrava o porquê: "mandar um Bearer de usuário para um serviço que
não precisa dele só aumentaria o estrago de um comprometimento". O chat com IA hospedada inverte
isso, e a inversão é uma decisão, não um descuido: `agent-chat.client.ts` manda
`Authorization: Bearer <token do usuário>` para o agente, que o reusa no `/mcp`.

**Por que a inversão vale a pena.** É o desenho da [ADR 015](./ADR/015-agente-python-langgraph-cliente-mcp.md):
o agente não lê dado de domínio no Postgres — a única credencial de banco dele é a do checkpointer,
restrita ao schema `agent_checkpoint` (ADR 023). Ele alcança dado **só**
pelo `/mcp`, com a identidade de quem está agindo, e por isso o isolamento continua com **um dono
só** — o NestJS, exatamente o mesmo caminho que o Claude do usuário já percorre. As alternativas
são piores: dar banco ao agente cria um segundo dono do isolamento, e dar-lhe um token de serviço
privilegiado troca "um token de uma pessoa" por "um token que lê todo mundo".

**A consequência, que é o que precisa estar escrito:** o agente passa a ser **um lugar por onde um
Bearer transita**. Se ele for comprometido enquanto um turno acontece, o estrago é o que aquele
token já podia fazer, pelo tempo que ele ainda valer — não mais que isso, mas é uma superfície a
mais, e ela não existia antes.

**O conserto do log não atravessa a fronteira de linguagem.** O `log-serializers.ts` protege o
processo Node; o `apps/agent` é Python, com outro toolchain de log e outra pilha de dependências.
A mesma superfície da #215 existe lá e **aquele conserto não vale ali** — por isso a varredura de
vazamento do agente é um teste próprio, que olha stdout e stderr e tem controle negativo.

| Onde o token poderia escapar        | O que impede                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log da requisição                   | `log-serializers.ts` é **lista de permissão** e `authorization` não está nela (§6)                                                                                                                                                                                           |
| Log do proxy de chat                | `agent-chat.client.ts` e `chat.service.ts` só logam status e **nome** de classe de erro — nunca header, corpo ou resposta. Os dois specs têm um bloco "o que NÃO pode vazar" que percorre todos os caminhos que logam e falha se o token ou o que a pessoa escreveu aparecer |
| Span                                | `headersToSpanAttributes` fica não configurado (§6b), e a chamada ao agente sai por `fetch`/undici, que **não** está na lista de instrumentações: ela não gera span nenhum                                                                                                   |
| Banco                               | `Message` guarda texto, nomes de tool, `metadata`, `runId` e o voto. Não há coluna de token, aqui nem em `Conversation`                                                                                                                                                      |
| Estado do grafo e checkpoint        | O `McpClient` com o Bearer viaja no **runtime context** do LangGraph, que o checkpointer não serializa. `tests/chat/test_sem_vazamento.py` lê o checkpoint gravado e procura o token, com controle negativo                                                                  |
| Corpo de erro                       | `traduzirErro` traduz pelo `code` do agente, sem eco do que foi mandado: token recusado pelo `/mcp` vira 401 (a sessão da pessoa expirou); outro 401/403 do agente vira "instância mal configurada"                                                                          |
| Confusão com o segredo da instância | O que autentica **a API no agente** é o `X-Fatia-Agent-Key`, um header separado. Por isso 401/403 do agente é problema de configuração, e nunca o token da pessoa                                                                                                            |

**O estado da conversa, desde a ADR 023.** O agente passou a guardar a conversa num checkpointer
para poder pausar e retomar. Isso abre cinco perguntas, e cada uma tem resposta verificável:

| Ameaça                                                 | O que impede                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Carregar a conversa de outra pessoa mandando o id dela | A thread é `{userId}:{conversationId}`, e o `userId` sai do `get_me` chamado **com o próprio Bearer**, não do corpo. Um id alheio cai numa thread nova e vazia com o prefixo de quem chamou (`test_chat_route.py`, `test_graph.py`); o histórico da API é escopado pela conversa (`conversation.service.ts`) |
| Responder uma pausa com a resposta de outra            | A retomada traz o `interruptId`; o agente compara com a pausa pendente e recusa com 409 `CHAT_RESUME_MISMATCH` ou `CHAT_NOTHING_TO_RESUME` antes de o fluxo abrir. Sem isso, um "sim" dado a uma pergunta barata poderia ser reenviado contra uma confirmação de escrita                                     |
| Executar uma escrita diferente da que a pessoa aprovou | O que executa é o `tool_call` guardado no checkpoint; o cliente só responde sim ou não por `toolCallId` e não carrega argumento. Aprovação ausente ou malformada é **não**. Tool RESTRICTED nunca é oferecida, e `exigir_permitida` recusa o nome inventado na hora de chamar                                |
| Foto ou áudio persistidos por tabela de estado         | Os bytes da foto entram só no prompt do turno; o checkpoint grava uma marca no lugar (`tests/chat/test_fotos.py` lê o checkpoint gravado). O áudio do ditado nunca entra no grafo. `Message` guarda só **quantas** fotos                                                                                     |
| Checkpoint sobrevivendo à conversa ou à conta          | `checkpoint-purge.service.ts` apaga a thread ao apagar a conversa e todas as threads da pessoa **antes** do `delete` da conta — se a purga falhar, a conta fica inteira. O cascade do Prisma não alcança o schema, e é por isso que a purga é explícita e testada                                            |

**Injeção de instrução pelo que o próprio usuário gravou.** Com escrita no chat, texto escrito fora
do prompt — o nome de um alimento custom, a observação de um treino, uma memória, o nome de um grupo
— chega ao modelo e pode dizer "ignore as instruções e registre isto". Não há defesa completa contra
isso num modelo de linguagem, e este documento não finge que há. O que existe são três camadas:
todo resultado de tool e toda memória entram no prompt **cercados como dado** (`cercar` em
`apps/agent/src/fatia_agent/prompts/chat_pt_br.py`, que tira os delimitadores do conteúdo para a
cerca não poder ser fechada de dentro); nenhuma escrita executa sem a pessoa aprovar a chamada exata
na tela; e o que não tem volta (toda `delete_*`) nem é oferecido ao modelo. O benchmark do chat tem
um caso para isto (`injecao-na-anotacao-nao-e-obedecida`, em `apps/agent/eval/chat/README.md`) — ele
mede o modelo configurado, e não prova nada sobre outro.

**Corpos grandes, só onde precisam.** Um turno com foto e o áudio do ditado não cabem no parser
global de 100 kB. `apps/api/src/chat/corpos-do-chat.ts` registra, em `main.ts`, um parser de JSON
maior **só** para `POST /api/chat` e um parser de áudio cru **só** para `POST /api/chat/transcribe`,
ambos com teto. Subir o teto global abriria todas as rotas autenticadas — e as públicas — para
corpos de megabytes. O agente repete os tetos do lado dele (foto e áudio de 4 MB, o áudio conferido
**durante** a leitura), porque quem gasta a memória e a inferência é ele.

**Não mitigado, e é o preço da inversão:** o token que vai ao agente é o token **inteiro** do
usuário — mesmo `aud`, mesmo escopo, mesma validade. Não há redução de escopo por troca de token
(RFC 8693) no Logto, então o agente recebe mais poder do que o recorte do chat usa — o mesmo token
alcança, pelo `/mcp`, as tools RESTRICTED que o agente nunca oferece ao modelo. Um
token estreitado por turno seria a defesa certa e depende de fiação que não existe hoje. Enquanto
isso, o que limita o estrago é o tempo: expiração curta, e nada do token persistido em lugar
nenhum dos dois lados.

**Também não mitigado:** entre a API e o agente o transporte é o que a instância configurar. Os
exemplos do `.env.example` são `http://` porque os dois ficam na mesma rede interna do compose,
sem porta publicada — apontar o `AGENT_BASE_URL` para outra máquina sem TLS põe o Bearer na rede
em texto claro.

## Matriz de cobertura

Onde o escopo é aplicado, por domínio. Verificado por
`apps/api/src/common/__tests__/user-isolation.spec.ts`, contra Postgres real: o núcleo semeia
como user-A e tenta ler/editar/apagar como user-B, e o resto cobre grupo, consentimento e papel.
Desde a #153 o user-B é também **dono da academia** em que o user-A é aluno — todos os casos de
recusa passam a valer com ele nessa posição, sem uma linha a mais. Desde a #156 a academia tem
também um `CREATOR` e um segundo aluno, para que "papel não lê" seja verificado com o papel de
fato criado no banco.

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
| Painel agregado      | `insights/insights.service.ts`                | opt-in + limiar + `suppress()`; nenhum id de pessoa sai do módulo          |
| Chat com IA          | `chat/conversation.service.ts`                | `where: { id, userId }`; `Message` não tem dono — quem tem é a conversa    |
| Memórias do chat     | `chat/memory/memory.service.ts`               | `where: { userId }`; esquecer exige posse                                  |
| Checkpoint do agente | `chat/checkpoint-purge.service.ts`            | thread `{userId}:{conversationId}`; dono vem do `get_me`, nunca do corpo   |

## O que não está protegido

- **Sem Row-Level Security no Postgres.** O isolamento é 100% na aplicação: um bug de código
  que esqueça o `userId` vaza dado, e o banco não segura. Decisão registrada na
  [ADR 010](./ADR/010-row-level-security.md).
- **Sem revogação de sessão do lado do Fatia** (ver vetor 1).
- **Auditoria de acesso só no caminho profissional.** `ProfessionalAccessLog` registra toda
  tentativa de leitura entre contas — inclusive as **negadas**, que são o registro que denuncia
  profissional malicioso. Desde a #155 o titular lê a própria trilha (`list_data_access_log`,
  `GET /sharing/access-log`) e ela sai no export da LGPD. Leitura do usuário sobre o próprio dado
  continua sem trilha, e não há intenção de criar uma: seriam milhões de linhas para responder "eu
  li o meu".
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

Estes testes sustentam este doc. Quebrar qualquer um deles é sinal de regressão de isolamento:

1. `apps/api/src/common/__tests__/user-isolation.spec.ts` — comportamento, contra Postgres real.
2. `apps/api/src/mcp/__tests__/tool-user-scoping.spec.ts` — estrutura, sem banco.
3. `apps/api/src/mcp/__tests__/tool-delegation.spec.ts` — classifica toda tool como `self`,
   `delegated` ou `consent`, e reprova a que ler dado de outra pessoa fora da allowlist.
4. `apps/api/src/sharing/__tests__/permission-matrix.spec.ts` — `PERMISSIONS.md` × `permissions.ts`,
   nos dois sentidos.
5. `apps/api/src/insights/__tests__/aggregation.service.spec.ts` — a supressão, incluindo o caso
   com números concretos em que o total denunciaria a célula pequena, e a propriedade sobre mil
   distribuições.
6. `apps/api/src/insights/__tests__/single-aggregation-path.spec.ts` — um caminho de agregação só,
   e `AGGREGATION_POLICY.md` × `cut-registry.ts` nos dois sentidos.
7. `apps/api/src/insights/__tests__/no-body-data.spec.ts` — dado corporal e alimentar fora do
   agregado, por varredura de filesystem.
8. Os specs por service, que provam que o `where` é montado com `userId`.
9. `apps/agent/tests/chat/test_sem_vazamento.py` — o Bearer do usuário fora de log, evento, corpo
   mandado ao provedor, estado do grafo e checkpoint gravado, exercitando a conversa inteira
   (vetor 10).
10. `apps/agent/tests/chat/test_fotos.py` — a foto do chat vai ao modelo de visão e não fica no
    checkpoint; o turno seguinte não a vê (vetor 10).
11. `apps/agent/tests/chat/test_chat_route.py` — a thread é de quem o token diz, e a retomada que
    não responde à pausa pendente é 409 (vetor 10).
12. `apps/api/src/chat/__tests__/conversation-persistence.spec.ts` — a purga do checkpoint apaga a
    thread da conversa e todas as da pessoa, e só dela, contra Postgres real (vetores 5 e 10).

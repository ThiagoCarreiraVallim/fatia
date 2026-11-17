# Cobrança — empacotamento

> **Escopo deste documento:** o **add-on de insights** (#160), o **cálculo da cobrança por aluno
> ativo** (#158, superado pelos assentos), o **plano PRO do usuário**
> ([ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md), seção
> [Plano PRO](#plano-pro-do-usuário-adr-024)) e os **assentos de comunidade**
> ([ADR 025](./ADR/025-assentos-de-ia-por-comunidade.md), seção
> [Assentos](#assentos-de-comunidade-adr-025) no fim). PRO e assentos têm persistência completa
> (assinatura, webhook, idempotência).

## Linhas de receita

| Item                                | Cobrança                    | Cancelamento         | Estado             |
| ----------------------------------- | --------------------------- | -------------------- | ------------------ |
| Assentos de IA da comunidade        | mensal, **por assento**     | no fim do período    | ADR 025, pronto    |
| Assinatura base (por aluno ativo)   | mensal, proporcional ao uso | encerra o grupo      | superada (ADR 025) |
| Add-on de insights de comportamento | mensal, **preço fixo**      | independente da base | #160, esta fatia   |

**O add-on é vendido à parte, e cancelável à parte.** Cancelar os insights não mexe na assinatura
base, e cancelar a base leva o add-on junto porque não sobra grupo a analisar.

**Preço fixo, não por consulta nem por volume.** Cobrar por consulta cria incentivo para o dono
consultar menos — e ele já paga pelo dado que ele mesmo gerou. Preço por volume premiaria a
academia grande com o preço da pequena invertido, e o custo do painel é dominado pelo
desenvolvimento, não pela consulta.

## Como o direito é conferido

A porta é `apps/api/src/billing/entitlements.port.ts`:

```ts
abstract hasInsights(groupId: string): Promise<boolean>;
```

Duas implementações previstas, uma injeção:

- **Hoje** — `StaticEntitlementsService` lê `INSIGHTS_ADDON_GROUP_IDS` do env: uma lista de ids de
  grupo habilitados à mão, que cabe nos primeiros clientes e não cabe no décimo.
- **Quando a #158 entrar** — `SubscriptionEntitlementsService` lê `GroupSubscription.insightsAddOn`.
  A troca é um `provide` em `billing.module.ts`; nenhum arquivo do painel é tocado.

**Dívida declarada.** A lista do env não sabe que um cliente cancelou: um grupo continua com o
painel até alguém editar a variável. É aceitável enquanto forem poucos clientes, e a mitigação
real é a #158 — não um cron que leia planilha.

O direito é conferido **na rota** (`InsightsAddonGuard`), e não na tela. Grupo sem o add-on recebe
`NOT_FOUND`, não `402`: não vale confirmar que o painel existe para quem não contratou.

## O que o add-on **não** compra

Nada de exceção à [`AGGREGATION_POLICY.md`](./AGGREGATION_POLICY.md). Mesmo limiar, mesma
supressão, mesmo catálogo de recortes, mesmo opt-in dos alunos. Pagar mais não compra recorte mais
estreito, e é essa a frase que precisa sobreviver à primeira negociação comercial.

---

# Cobrança por aluno ativo (#158)

> **Superada pela [ADR 025](./ADR/025-assentos-de-ia-por-comunidade.md).** A comunidade paga por
> assento escolhido, não por aluno ativo; ver [Assentos](#assentos-de-comunidade-adr-025). O cálculo
> abaixo continua no código como **métrica** do painel (quem está ativo), não como base de cobrança.

## O que já existe, e o que ainda falta

Existe e está testado: a **definição de aluno ativo**, o **fechamento do ciclo** com pró-rata, a
**porta do provedor** com o adapter do Asaas, a **degradação por inadimplência** e o comando de
simulação. Tudo isso é cálculo e integração — não depende de tabela nova.

Falta a **persistência**: `GroupSubscription`, `BillingInvoice`, `BillingInvoiceLine` e
`BillingWebhookEvent`, e com elas o controller do painel do dono e o endpoint de webhook (que
precisa da tabela de eventos para ser idempotente — o provedor reentrega por design). A migration
está proposta e ainda não foi aplicada; enquanto isso, os parâmetros da assinatura (faixa, preço,
dia do fechamento) entram por argumento no comando de simulação.

## Quem conta como aluno ativo

Esta é **a regra**, e ela é pública para que a academia consiga conferir a fatura sozinha, sem
pedir relatório a ninguém.

> Conta como **aluno ativo** no ciclo quem, ao mesmo tempo:
>
> 1. esteve associado a um grupo **patrocinado** em qualquer momento do ciclo, com papel `MEMBER`
>    **no fechamento**; **e**
> 2. registrou pelo menos uma atividade própria no app dentro dos **30 dias** que terminam no
>    fechamento do ciclo.
>
> Atividade própria é qualquer um destes registros: **refeição, sessão de treino, peso, passos,
> hidratação, meta criada ou concluída**. Série de treino conta pela sessão a que pertence.
>
> **Uso de IA não conta em nenhuma direção.** O aluno que traz a própria IA conta igual, e o que
> nunca usou IA conta igual.
>
> Papéis `OWNER`, `PROFESSIONAL` e `CREATOR` **não** contam como aluno.

Três consequências que valem escrever antes de alguém perguntar:

- **Grupo social nunca gera cobrança**, para ninguém. O grupo do influenciador não é "faturado em
  zero": ele não é faturado, e ninguém conta os fãs dele. Tentar fechar o ciclo de um grupo social
  é erro, não fatura vazia.
- **Um ciclo de 31 dias tem um primeiro dia fora da janela de atividade.** É consequência da regra
  publicada — 30 dias são 30 dias —, não arredondamento.
- **O papel vale pelo estado do fechamento, não pelo histórico.** O banco guarda o papel atual da
  associação e não a troca dele: não existe "era `MEMBER` até dia 20". Então promover um aluno a
  `PROFESSIONAL` no último dia tira o ciclo inteiro da fatura, e rebaixar um profissional a
  `MEMBER` no último dia cobra o ciclo inteiro. É a aproximação honesta com o schema de hoje, e
  está escrita aqui em vez de descoberta na fatura. Cobrar pelo papel vigente em cada dia exigiria
  histórico de papel — coluna que não existe e que esta fatia não cria.

O que vale como data do registro é o momento em que ele **entrou no app**, e não a data que o
usuário declarou. Quem lança hoje a refeição de semana passada usou o app hoje. (A exceção é a
sessão de treino, que no banco só tem a data do treino.)

## Pró-rata de quem entra ou sai no meio do ciclo

```
proRataMilli = arredonda(dias_com_associação_no_ciclo / dias_do_ciclo × 1000)
valor_da_linha = arredonda(preço_por_aluno_em_centavos × proRataMilli / 1000)
```

O dia conta inteiro se a associação existiu em **qualquer momento** dele. É a regra mais simples de
conferir ("entrou dia 11, pagou 21 de 31") e a única que não depende da hora em que o aluno apertou
o botão.

Tudo é **inteiro em toda etapa** — centavo e milésimo, nunca decimal. A soma de N linhas de fatura
não acumula resíduo de ponto flutuante, por maior que seja N, e N aqui é o número de alunos.

**O ciclo fecha à meia-noite do fuso do grupo**, nunca em UTC. Fechar em UTC jogaria para fora da
janela todo aluno que registrou entre 21h e a meia-noite do último dia: três horas de atividade que
existiram e que a fatura diria não existir, sempre para o mesmo lado. O dia do fechamento é
limitado a **1..28** — 29, 30 e 31 não existem em todo mês, e um ciclo que pula fevereiro não avisa
que pulou.

## O que a fatura mostra sobre cada aluno — e o que ela não mostra

Cada linha da fatura carrega exatamente quatro campos:

| Campo          | Para quê                                                   |
| -------------- | ---------------------------------------------------------- |
| `membershipId` | a academia reconcilia com a própria lista de alunos        |
| `displayName`  | o nome que o aluno já exibe no grupo, congelado na emissão |
| `proRataMilli` | a fração do ciclo, para conferir o valor                   |
| `amountCents`  | o valor da linha                                           |

**Não existe, e não é esquecimento:** data da última atividade, contagem de sessões, dias sem
treinar, faixa de horário, ou qualquer outro sinal de comportamento individual.

O motivo é o mesmo da [matriz de permissões](./PERMISSIONS.md): quem lê a fatura é o dono da
academia, e ele **não tem acesso a dado de saúde de aluno nenhum**. Uma coluna "último acesso"
entregaria pela porta dos fundos o que a porta da frente nega, e ninguém consentiu com isso. A
academia audita a **conta**; ela já tem a lista de alunos para reconciliar.

A contagem também **não passa pela porta de leitura profissional** (`assertReadable`). Contar não é
ler: a função que decide quem está ativo devolve um `Set` de ids e nada mais — nenhum registro,
nenhum timestamp, nenhum conteúdo. Passar pela porta de consentimento diria que o dono está lendo
dado do aluno, e ele não está.

`apps/api/src/billing/__tests__/no-billing-in-student-surface.spec.ts` transforma tudo isso em
teste: nenhuma tool MCP pode mencionar cobrança, nenhum controller fora de `billing/` pode conhecer
fatura, nenhum módulo do aluno pode importar cobrança, e a linha da fatura não pode ganhar um
quinto campo sem alguém decidir isso explicitamente.

## Inadimplência degrada, não bloqueia

`decideAiTier` calcula qual nível de IA patrocinada o grupo teria, dado o estado da assinatura:

| Estado da assinatura          | Nível de IA        |
| ----------------------------- | ------------------ |
| `ACTIVE` / `TRIALING`         | a faixa contratada |
| `PAST_DUE` dentro da carência | a faixa contratada |
| `PAST_DUE` fora da carência   | `none`             |
| `CANCELED` / sem assinatura   | `none`             |

**`TRIALING` existe, mas só no PRO pessoal.** A #386 acrescentou `TRIALING` ao enum
`SubscriptionStatus` (`UserSubscription`, PRO pessoal) para o teste grátis; esta tabela continua
falando do `StatusDeAssinatura` de `billing/ai-tier.ts`, escrito para a `GroupSubscription` (cobrança
por aluno ativo), que nunca foi criada e foi superada pela ADR 025. O teste do PRO pessoal está em
"Teste grátis", abaixo.

`none` **não é bloqueio**: é o app inteiro sem a IA por conta da academia. Registro manual, PWA, app
nativo e o MCP com a IA do próprio usuário continuam funcionando, e quem traz a própria IA (#164)
não percebe diferença nenhuma. O app é grátis para o aluno; ele não pode virar refém de uma disputa
comercial entre a academia e a Fatia — e o que ele perderia de vista é o histórico de saúde dele.

A função **nunca lança**, inclusive diante de um status que o deploy corrente não conhece. Um
`throw` num caminho de aluno seria bloqueio por acidente, decidido por ninguém.

**A regra está calculada e ainda não está ligada.** Nada no app consulta `decideAiTier` hoje: a
assinatura mora em `GroupSubscription`, que depende da migration que esta fatia não entrega, e sem
o estado gravado não há o que passar para a função. Na prática, portanto, **nenhum grupo é
degradado hoje** — todos usam a IA como antes. Quem ligar a persistência liga a chamada junto.

## O provedor fica atrás de uma porta

O Asaas é conhecido por **um arquivo só**, `apps/api/src/billing/asaas/asaas.provider.ts`, por trás
da interface `BillingProvider`. Nome de endpoint, header de autenticação e vocabulário de status são
detalhe de um fornecedor; a contagem e a pró-rata não. **Sem dependência nova**: `fetch` é global no
Node 24, e nenhum cliente HTTP entra no caminho de um segredo de pagamento.

Nenhum teste do repositório toca a rede: quem exercita o adapter é `asaas.provider.spec.ts`,
trocando o `fetch` global. E `AsaasProvider.fromEnv` **recusa rodar em `NODE_ENV=test`**: um teste
apontado para o Asaas de verdade falha na primeira execução, em vez de aparecer como cobrança
criada por engano.

Não existe dublê genérico da porta, e é deliberado: `verifyWebhook` recebe o corpo **cru**, no
vocabulário do provedor. Um fake que aceitasse o vocabulário da Fatia não substituiria o adapter em
teste nenhum — passaria verde justamente sobre a tradução de status, que é o que o adapter existe
para fazer. O dublê útil nasce junto com o handler de webhook, e falando Asaas.

## Conferir a conta antes de ela virar dinheiro

```bash
pnpm billing:dry-run --group <id> --price 1500 --cycle-day 1 --tier basico [--at 2026-09-01T12:00:00Z]
```

Fecha o ciclo lendo o banco de verdade, imprime período, contagem e cada linha — e **não grava
nada, não cria cobrança e não fala com o provedor**. O comando não importa o adapter do Asaas.

## Roteiro de sandbox — o que só o dono consegue exercitar

Com a chave do próprio sandbox (gratuita, em `https://sandbox.asaas.com`), o caminho ponta a ponta é:

1. `ASAAS_BASE_URL=https://api-sandbox.asaas.com` e `ASAAS_API_KEY=<chave do sandbox>` no `.env`.
2. `ensureCustomer` → `POST /v3/customers` com `externalReference` = id do grupo. Guardar o
   `providerCustomerId` devolvido.
3. `createCharge` → `POST /v3/payments` com `externalReference` = id da fatura. Conferir que
   `dueDate` saiu no dia certo (ele é formatado no fuso do provedor, não em UTC) e que `value` bate
   com `totalCents / 100`.
4. Pagar a cobrança pela `invoiceUrl` no ambiente de sandbox.
5. Configurar o webhook no painel do sandbox, com o segredo de `ASAAS_WEBHOOK_TOKEN`, e conferir que
   `PAYMENT_RECEIVED` chega com o header `asaas-access-token`.

O que foi conferido de fato contra o sandbox nesta fatia, sem chave: o host responde, o header de
autenticação é `access_token` (a API reclama do **formato** da chave, ou seja, leu o header) e o
envelope de erro é `{"errors":[{"code","description"}]}` — que é o que o adapter traduz. **Criar
cliente e cobrança exige chave e não foi exercitado**; os passos 2 a 5 acima são o roteiro para o
dono fazer isso com a chave dele.

---

# Plano PRO do usuário (ADR 024)

| Plano | O que tem                                                                           | Preço                             |
| ----- | ----------------------------------------------------------------------------------- | --------------------------------- |
| Free  | o app inteiro (registro, metas, treino, progresso) + MCP com a IA da própria pessoa | grátis                            |
| PRO   | o Free + a IA hospedada do Fatia: chat, ditado e foto de refeição                   | R$ 19,90/mês ou R$ 179/ano (−25%) |

**O portão é um só e fica em `ai/`.** Toda chamada ao agente passa pelo `HostedAiService`
(`ai/hosted-ai.service.ts`): `AiAccessService.assertPodeUsar` responde 402 `AI_PLAN_REQUIRED` a quem
está no Free, depois vem a cota (#135), que vale também para o PRO, e o uso é gravado com quem pagou.
O cliente HTTP do agente (`AgentAdapter`) não é exportado pelo `AiModule`, então um caminho novo não
tem como chamar o agente sem passar por ali; `ai/__tests__/hosted-ai.service.spec.ts` prova, com um
adapter falso, que sem direito o agente não é chamado e que toda chamada grava o uso. As telas leem `allowed` + `reason` de `/chat/availability` e
`/nutrition/photo-recognition` e mostram o cadeado; o plano em si é lido em `GET /billing/plan`,
nunca em `/users/me` (os domínios do aluno não importam `billing/`).

**Self-host continua livre.** `AI_REQUIRES_PLAN=false` (padrão) faz o direito sair `PRO` com origem
`INSTANCE` para todo mundo. A instância pública liga `true`.

## Uma tabela, quatro origens

`UserSubscription` guarda a assinatura de qualquer origem; o direito sai da **leitura** das datas
(`billing/ai-entitlement.ts`, função pura), sem job de expiração. A única exceção é o teste da web
que acabou sem pagamento: o direito já cai sozinho no fim do teste, e o job dos avisos só fecha a
recorrência no Asaas (abaixo).

| Origem   | Como entra                                                  | Como sai                                      |
| -------- | ----------------------------------------------------------- | --------------------------------------------- |
| `ASAAS`  | checkout web (`POST /billing/checkout`) + webhook           | `POST /billing/cancel` (fim do período)       |
| `APPLE`  | compra no app (RevenueCat) + webhook ou sync                | só na App Store                               |
| `GOOGLE` | compra no app (RevenueCat) + webhook ou sync                | só no Google Play                             |
| `MANUAL` | `pnpm billing:grant-pro <email> [--days N]` (cortesia, E2E) | `--revoke` (expira) ou `--purge` (apaga, E2E) |

| Estado gravado                            | Direito                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `PENDING` (checkout sem pagamento)        | Free, com "pagamento aguardando confirmação"             |
| `ACTIVE` dentro do período                | PRO                                                      |
| `ACTIVE` com o período vencido há < 1 dia | PRO (a renovação está a caminho)                         |
| `ACTIVE` vencido há mais de 1 dia         | tratado como `PAST_DUE`: PRO por mais 7 dias de carência |
| `PAST_DUE` dentro da carência             | PRO, com aviso                                           |
| `PAST_DUE` fora da carência               | Free                                                     |
| cancelado com `cancelAtPeriodEnd`         | PRO até o fim do período, depois Free                    |
| `EXPIRED` (estorno, chargeback, loja)     | Free                                                     |

Inadimplência **degrada**, como no grupo: tira só a IA hospedada. Registro manual, histórico e o MCP
não mudam.

### O que "Meu plano" mostra em cada estado (redesign, #386)

`GET /billing/plan` devolve `state` (`FREE`, `TRIAL`, `ACTIVE`, `PENDING`, `PAST_DUE`, `CANCELED`,
`EXPIRED`), `paidBy` (`PERSONAL`, `SEAT`, `COMMUNITY`, `PROGRAM`), `trialEndsAt`, `trialEligible`,
`trialDays` e `paymentMethod`. A tela não decide nada sozinha: `planStatusView(plan, { surface,
canPurchase, now })` (`packages/api-client/src/plan-status.ts`, com teste) devolve o selo, o texto e
os botões, igual na web e no app (pranchas Al-M13, Al-M13b/c/d e Al-M5):

| Estado     | Na web                                                                                             | No app                                                      |
| ---------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `TRIAL`    | "Teste grátis até …", pagar a 1ª cobrança até o fim (página de pagamento), cancelar o teste        | "Teste grátis até …"; na loja, "cancelar nas assinaturas"   |
| `PENDING`  | "Aguardando o pagamento" + "Abrir página de pagamento"                                             | "Você assinou fora do app. Avisamos por e-mail…", sem botão |
| `ACTIVE`   | preço, forma de pagamento, cancelar; a 3 dias do vencimento (toda forma): "vence em breve" + pagar | estado e datas; na loja, "cancelar nas assinaturas da loja" |
| `PAST_DUE` | "venceu hoje" / "faltam N dias para a IA pausar" + pagar                                           | "Pagamento não passou… mandamos por e-mail", sem botão      |
| `CANCELED` | "PRO até …", sem cobrar de novo                                                                    | igual                                                       |
| `EXPIRED`  | "A IA pausou" + pagar e "Assinar de novo" (cobrança aberta) ou "Voltar ao PRO" com o formulário    | "Seu PRO acabou" + oferta da loja ou da comunidade          |

Assinatura da loja com falha de cobrança (`PAST_DUE` em `APPLE`/`GOOGLE`, Al-M13d): nas duas
superfícies, "A loja não conseguiu cobrar", "Abrir assinaturas da App Store / do Google Play" e
"Por que não dá para pagar aqui?". PRO pago pela comunidade (Al-M5): quem paga, "Enquanto você for
membro" ou "Durante o <programa>" com a data e os dias que faltam, "Abrir a IA".

### A regra das lojas: o app nunca vende fora da loja

- No app (iOS e Android) a compra é **só** pela loja, via RevenueCat, e só com
  `EXPO_PUBLIC_IAP_ENABLED`. Nenhum preço do Asaas, Pix, boleto, link de pagamento ou "cancelar" da
  assinatura da web aparece no app: `planStatusView` com `surface: 'app'` nunca devolve a ação
  `pay` nem `cancel` (teste em `plan-status.test.ts`, com mutação vista falhar).
- Sem compra no app, a oferta é "O PRO vem pela sua comunidade" e "Tenho código" (abre a entrada por
  código da comunidade), sem preço nem link.
- **Assinatura feita na web, vista no app:** mostra o estado e as datas — o que a pessoa já tem —,
  com "Fora do app" e "mandamos por e-mail como resolver", **sem botão**. É o texto da prancha
  Al-M13 e o que as diretrizes de serviços multiplataforma permitem (acessar o que foi comprado em
  outro lugar) sem orientar compra fora da loja. O antigo "entre no Fatia pelo navegador para
  gerenciar" saiu.
- O push de cobrança não leva preço, Pix, boleto nem link (ele aparece no celular); o e-mail leva
  ao Meu plano da web.
- O teste no app só é prometido ("Começar 7 dias grátis") quando o pacote da loja tem oferta
  introdutória grátis (`storeTrialDays`) **e** a pessoa ainda não usou o teste no Fatia. Quem
  decide a elegibilidade e cobra é a loja.

## Teste grátis (#386)

`BILLING_PRO_TRIAL_DAYS` (padrão 7; 0 desliga) dias de PRO, **uma vez por pessoa**
(`User.proTrialStartedAt`; elegível quem nunca teve teste nem assinatura pessoal paga).

- **Web:** o primeiro checkout de quem é elegível já é o teste. A linha nasce `TRIALING` com
  `trialEndsAt` = `currentPeriodEnd` e a primeira cobrança do Asaas vence no fim do teste — nada é
  cobrado hoje. **Nada é cobrado sozinho, nem no cartão:** o Fatia nunca recebe o cartão, então a
  pessoa paga a primeira cobrança até o fim do teste (Pix, boleto ou cartão, na página de pagamento
  do Asaas, que a tela mostra durante o teste). Teste que acaba sem pagamento volta ao Free **sem
  carência** (`teste_acabou`), com as 24 h de folga da renovação.
- **Reserva amarrada ao Asaas:** o checkout roda sob uma trava por pessoa
  (`pg_advisory_xact_lock`) e reserva o teste (`proTrialStartedAt`) na mesma transação que grava a
  linha. Asaas fora do ar → rollback, o teste não é gasto. Assinatura criada no Asaas que não chega
  ao banco (link, insert ou commit falhou) é cancelada lá (compensação, log
  `checkout_compensado`). Duas abas enviando juntas: a segunda espera a trava, relê o direito e
  recebe 409 (ou, sem teste, reaproveita o checkout aberto).
- **Teste vencido sem pagamento:** 4 dias depois do fim (o boleto ainda pode compensar nesse
  intervalo), a rodada do `BillingReminderJob` cancela a assinatura no Asaas e grava `EXPIRED`
  (`expireUnpaidTrials`, idempotente; Asaas fora do ar tenta na próxima rodada).
- **Assinar de novo:** o checkout cancela no Asaas **toda** assinatura ainda viva da pessoa
  (`PENDING`, `TRIALING`, `ACTIVE` ou `PAST_DUE` vencidas — quem chega ao checkout é Free), e o
  webhook acha a linha pelo `providerRef`: evento da assinatura antiga nunca mexe na nova. Teste
  cancelado ou `EXPIRED` volta a ver o formulário ("Voltar ao PRO"; com cobrança aberta, "Pagar" e
  "Assinar de novo"); cancelar limpa o link de pagamento, e assinatura cancelada não mostra link
  velho.
- **Loja:** a RevenueCat informa `period_type: TRIAL`; a linha vira `TRIALING` e marca
  `proTrialStartedAt`. A loja converte ou não; o Fatia só lê.

**Limites do "um teste por pessoa"** (decisão da revisão da #386, sem código a mais):

- A elegibilidade da oferta introdutória da loja é **por conta da loja** (Apple ID, conta Google),
  não por conta do Fatia. O app só _promete_ o teste a quem o Fatia acha elegível, mas quem decide e
  cobra é a loja: quem já testou pela web pode ganhar o teste da loja, e vice-versa quando a mesma
  conta da loja é usada por outra pessoa.
- Apagar a conta apaga o `proTrialStartedAt`: quem apaga e cria a conta de novo volta a ser elegível
  na web. Guardar um rastro (e-mail, CPF) para impedir isso contraria a exclusão de verdade (o CPF
  nem é gravado).

## Avisos de cobrança (#386, prancha Ex-03)

`BillingReminderJob` (`billing/billing-reminder-job.service.ts`) roda de hora em hora e, a partir
das 9h no fuso da pessoa, manda push (`NotificationKind.BILLING`, sem chave na tela de
Notificações) e e-mail. Cada aviso é gravado em `BillingReminder` **antes** de sair, com unique
`(subscriptionId, kind, dueDate)`: rodar de novo ou duas instâncias não repetem. Lê o estado
gravado, não só o webhook.

| Aviso                 | Quando                                   | Quem                               |
| --------------------- | ---------------------------------------- | ---------------------------------- |
| `TRIAL_ENDING`        | 2 dias antes do fim do teste             | web e loja (a loja: onde cancelar) |
| `DUE_SOON`            | 3 dias antes do vencimento               | web, Pix, boleto e cartão          |
| `DUE_TODAY`           | no vencimento e no último dia do teste   | web, Pix, boleto e cartão          |
| `GRACE_5_LEFT`        | 2 dias de atraso                         | web                                |
| `GRACE_2_LEFT`        | 5 dias de atraso                         | web                                |
| `AI_PAUSED`           | 7 dias de atraso                         | web                                |
| `STORE_BILLING_ISSUE` | a loja não conseguiu cobrar (`PAST_DUE`) | loja: só "atualize na loja"        |

Assinatura da loja **nunca** recebe cobrança nem lembrete de pagamento do Fatia; cancelada e
cortesia não recebem nada. O cartão recebe o "vence em breve" e o "vence hoje" como Pix e boleto: o
Fatia não sabe se o cartão ficou salvo no Asaas, e no teste ele nunca foi pedido.

**Aviso de fim do teste da loja (decisão da revisão da #386): fica**, porque a prancha Al-M3
promete, mas é da loja. Push e e-mail dizem só "se não quiser continuar, cancele nas assinaturas da
loja", com o link da tela de assinaturas da App Store ou do Google Play. Nunca levam preço, link nem
instrução de pagamento do Fatia (teste em `billing-reminders.spec.ts`).

**Fuso:** o "hoje" do aviso e o dia do fim do teste são os do fuso da pessoa (`User.timezone`):
Cuiabá, Rio Branco e quem mora fora recebem às 9h locais, não na véspera. As datas de vencimento do
Asaas seguem em São Paulo, que é como o Asaas as grava. Fuso inválido cai em `America/Sao_Paulo`, e
uma assinatura que falha vai para o log (`aviso_de_cobranca_falhou`) sem parar a rodada. `PATCH
/me` e o `update_timezone` do MCP recusam fuso que não existe.

## Web: Asaas

1. `POST /billing/checkout { interval, cpf, paymentMethod? }` — o CPF é validado pelos dígitos, vai
   para o Asaas (que exige CPF para emitir) e **não é gravado**; guardamos só
   `User.asaasCustomerId`. O cartão é digitado na página do Asaas: o Fatia nunca o vê.
2. A API cria `POST /v3/subscriptions` com `billingType` = a forma escolhida (`PIX`, `BOLETO`,
   `CREDIT_CARD`; sem escolha, `UNDEFINED`), grava a linha `PENDING` (ou `TRIALING`, no teste) com o
   `invoiceUrl` da primeira cobrança e a `paymentMethod`, e devolve o plano. Tocar de novo em menos
   de 24 h com o mesmo período e a mesma forma devolve o mesmo link; trocar um dos dois cancela antes,
   no Asaas, toda assinatura ainda viva da pessoa. Um checkout por pessoa por vez (trava no
   Postgres). `PAYMENT_CREATED` e `PAYMENT_OVERDUE` atualizam o link da cobrança aberta.
3. O webhook (`POST /api/billing/webhooks/asaas`, header `asaas-access-token`) é gravado primeiro
   em `BillingWebhookEvent` (`@@unique([provider, eventId])`): reentrega vira no-op. Eventos:

   | Evento                                              | Efeito                                             |
   | --------------------------------------------------- | -------------------------------------------------- |
   | `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED`            | `ACTIVE`, fim = vencimento + ciclo (só avança)     |
   | `PAYMENT_OVERDUE`                                   | `PAST_DUE`, carência = vencimento + 7 dias         |
   | `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK_*`         | `EXPIRED`                                          |
   | `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` | pendente → `CANCELED`; ativa → `cancelAtPeriodEnd` |
   | assinatura que não é nossa                          | evento gravado com `error`, responde 200           |

4. Apagar a conta cancela a recorrência no Asaas **antes** de apagar o usuário
   (`ACCOUNT_DELETION_HOOKS`, `cancelBeforeAccountDeletion`), inclusive no meio do teste grátis. Se o Asaas falhar, a exclusão aborta: ninguém é cobrado depois de
   sair.

### Roteiro de sandbox do PRO

1. No `.env`: `ASAAS_BASE_URL=https://api-sandbox.asaas.com`, `ASAAS_API_KEY=<chave do sandbox>`,
   `ASAAS_WEBHOOK_TOKEN=$(openssl rand -hex 32)` e `AI_REQUIRES_PLAN=true`.
2. Expor a API (ex.: `cloudflared tunnel --url http://localhost:3000`) e cadastrar no painel do
   sandbox o webhook `https://<túnel>/api/billing/webhooks/asaas` com o mesmo token, marcando os
   eventos de cobrança e de assinatura.
3. Na web, "Meu plano" → anual ou mensal → CPF de teste válido → "Assinar PRO". A fatura abre numa
   aba nova; a tela fica em "Aguardando pagamento".
4. Pagar a fatura no sandbox. Conferir `BillingWebhookEvent` com `processedAt` e a tela virando PRO
   sem recarregar (ela consulta o plano a cada 5 s enquanto pendente).
5. "Cancelar assinatura" → a assinatura some no painel do Asaas e o plano mostra "PRO até …".

**Não exercitado aqui:** nenhum passo acima rodou contra o sandbox de verdade (não há chave neste
ambiente). Os testes cobrem o adapter com `fetch` simulado e o service contra o Postgres de teste.

## App: RevenueCat

A compra no app é obrigatoriamente pela loja. O app nunca mostra link de compra externa; quem
assinou pela web vê o estado e as datas, sem botão (ver "A regra das lojas", acima).

**A compra no app é desligável por build** (`EXPO_PUBLIC_IAP_ENABLED`, ligada só com `true` e com
as chaves da RevenueCat no build). O piloto vai às lojas com ela **desligada**: a IA chega pelo
assento da comunidade ou pela cortesia (`billing:grant-pro`). Desligada, a RevenueCat nem é
configurada, e "Meu plano" mostra o plano e diz que o PRO chega pela comunidade — sem pacote, sem
"restaurar compras", sem preço e sem mandar gerenciar ou comprar pela web (as lojas proíbem, num app
que não vende pela loja, apontar para a compra fora dele). A web continua vendendo pelo Asaas. A
decisão do que aparecer está em `planStatusView` (`surface: 'app'`) e em
`apps/mobile/src/billing/plan-offer.ts`, com teste.

Configuração (uma vez, no painel da RevenueCat):

1. Produtos nas lojas: `fatia_pro_mensal` e `fatia_pro_anual` (assinatura auto-renovável), com os
   preços equivalentes.
2. Entitlement `pro` ligado aos dois produtos; Offering padrão com os pacotes `$rc_monthly` e
   `$rc_annual`.
3. Webhook: `https://api.<domínio>/api/billing/webhooks/revenuecat`, com header Authorization igual
   a `REVENUECAT_WEBHOOK_AUTH`.
4. API: `REVENUECAT_SECRET_KEY` (v1, `sk_…`) no servidor; `EXPO_PUBLIC_REVENUECAT_IOS_KEY` e
   `_ANDROID_KEY` (públicas) no build do app.

Fluxo: o app faz `Purchases.logIn(<id do usuário no Fatia>)`, compra o pacote e chama
`POST /billing/revenuecat/sync`. Tanto o sync quanto o webhook leem `GET /v1/subscribers/:id` — a
RevenueCat é a fonte da verdade, então evento fora de ordem não importa. Problema de cobrança vira
`PAST_DUE`, `unsubscribe_detected_at` vira `cancelAtPeriodEnd`, estorno vira `EXPIRED`.

**Não exercitado aqui:** a compra real exige build de desenvolvimento e contas de teste nas lojas.

# Assentos de comunidade (ADR 025)

A comunidade (academia, treinador, criador) compra **assentos** e dá o PRO a quem escolher. Para o
membro, o assento é mais uma origem do mesmo direito: `aiTierForUser` lê a atribuição ativa como
fonte `GROUP`, e o uso da IA fica registrado com `paidBy = GROUP` e o `groupId` de quem pagou. Se a
pessoa também paga o próprio PRO, vale o dela — a comunidade não paga uso de quem já paga — e o dono
vê isso na lista de assentos (`ownPro`).

## Preço e ciclo

- **R$ 14,90 por assento por mês** (`BILLING_SEAT_MONTHLY_CENTS=1490`), sem mínimo de assentos, numa
  assinatura mensal do Asaas no valor `assentos × preço`. Um pool por comunidade
  (`GroupSeatPool`), com cliente próprio no Asaas (`externalReference: group:<id>`); o CPF/CNPJ vai
  ao Asaas e não é guardado.
- **Aumento vale na hora.** A recorrente passa ao valor novo (`updatePendingPayments`) e a diferença
  até o fim do período sai numa **cobrança avulsa proporcional** (`GroupSeatAdjustment`), contada em
  dias locais de São Paulo, hoje incluído. Ex.: 2 assentos a mais com 15 de 31 dias restantes =
  R$ 14,42. Abaixo de **R$ 5,00** (o mínimo do Asaas) os assentos valem sem cobrança avulsa.
- **Redução vale na renovação** (`nextPeriodSeats`). Se há mais pessoas com assento do que o número
  novo, o pedido é recusado (409) dizendo quantas retirar antes.

## Regras que valem hoje

1. **Se a cobrança avulsa do aumento falhar no Asaas, o aumento é desfeito** (o valor recorrente volta
   e a API responde 502).
2. **Avulsa vencida põe a comunidade em atraso**, com os mesmos 7 dias de carência da mensalidade; os
   assentos continuam valendo durante a carência e depois os membros voltam ao Free, sem perder dado.
3. **Com a comunidade em atraso, aumentar assentos é recusado** até regularizar.
4. **Só dá para atribuir assento depois do primeiro pagamento** confirmado.
5. Assento só para associação **ativa da própria comunidade**; sair ou ser removido revoga o assento
   na mesma transação.
6. Apagar a comunidade, ou a conta de quem é dona, **cancela os assentos no Asaas antes**; se o Asaas
   não responder, nada é apagado (503) e o pedido pode ser repetido.

## API (só o dono, `billing.read` / `billing.manage`)

| Rota                                                            | O que faz                               |
| --------------------------------------------------------------- | --------------------------------------- |
| `GET /groups/:groupId/seats`                                    | pool, atribuições, preço, próximo valor |
| `POST /groups/:groupId/seats/checkout` `{seats, taxId}`         | abre a assinatura (link de pagamento)   |
| `PATCH /groups/:groupId/seats` `{seats}`                        | aumenta (na hora) ou reduz (renovação)  |
| `POST /groups/:groupId/seats/cancel`                            | cancela no fim do período               |
| `POST\|DELETE /groups/:groupId/seats/assignments/:membershipId` | dá ou retira um assento                 |
| `GET /groups/:groupId/seats/invoices`                           | histórico de faturas, mais novas antes  |

A tela do dono é a seção **Assentos** do painel da comunidade (`/org/<id>/seats`, Fase 6): comprar
com CPF/CNPJ (não guardado), aumentar e reduzir com a explicação da cobrança, cancelar, quem usa e as
faturas. No app o painel mostra os assentos, tira assento e lista as faturas, mas **não compra, não
muda a quantidade e não cancela** — é pagamento fora da loja. O membro vê "PRO pela comunidade X" em
"Meu plano" e o selo na lista de comunidades.

### Faturas

| `SeatInvoiceStatus` | No painel (Assentos, #403) |
| ------------------- | -------------------------- |
| `PENDING`           | a vencer                   |
| `PAID`              | recibo                     |
| `OVERDUE`           | aviso no topo do painel    |
| `VOID`              | riscada                    |

`GroupSeatInvoice` guarda cada cobrança do Asaas da assinatura dos assentos (`SUBSCRIPTION`) e de cada
proporcional (`ADJUSTMENT`), atualizada a cada evento dela no webhook. É **cópia** do que o provedor
diz, para o dono ver; o direito à IA continua decidido pelo pool e pelos ajustes. Evento fora de ordem
não desfaz pagamento (paga só vira cancelada, por estorno ou contestação), e o link da fatura só é
guardado se for `https`. Cobranças anteriores à Fase 6 não aparecem: o histórico começa no primeiro
evento depois dela.

## Programas e ofertas (redesign, #403)

O redesign acrescenta **programas** (PRO por período para uma turma ou um desafio, como assento
com fim) e **ofertas** (programas vendidos pela comunidade, pagos pelo Asaas, com repasse). O
modelo de dados e o painel são da [#403](https://github.com/ThiagoCarreiraVallim/fatia/issues/403);
o **checkout público da oferta** (link, cupom, conta depois do pagamento) é a
[#421](https://github.com/ThiagoCarreiraVallim/fatia/issues/421) (Mapa 5.9), P2, fora da história
do redesign. As regras desta página valem para os dois: CPF/CNPJ vai ao Asaas e não é guardado,
webhook idempotente, e quem não pagou perde o conteúdo novo, nunca o que registrou.

## Webhook

O mesmo `POST /billing/webhooks/asaas`, com a mesma tabela de idempotência (`BillingWebhookEvent`). A
ordem de procura é **assinatura pessoal → pool de assentos (`providerRef`) → cobrança avulsa
(`providerChargeId`)**; só então o evento é marcado como desconhecido. A renovação confirmada aplica a
redução pedida, revogando as atribuições mais recentes se sobrar alguém (o 409 da redução evita isso).

## Cortesia e testes

`pnpm billing:grant-seat <email> <slug> [--seats N]` dá um assento de cortesia, sem cobrança (pool com
`providerRef` nulo); `--purge` desfaz sem deixar rastro. É o que o E2E usa.

**Trava de produção** (`billing/production-guard.ts`): `billing:grant-group`, `billing:grant-pro` e
`billing:grant-seat` mostram antes o que vão mudar e em qual banco (`host:porta/banco`, sem senha) e
recusam quando o ambiente parece produção — `NODE_ENV=production`, "prod" no host ou no nome do
banco, ou banco fora da máquina (qualquer host além de `localhost`, `127.0.0.1`, `::1`, `postgres`,
`db` e `host.docker.internal`) — a não ser com `--i-know-this-is-production`.

## PRO para todos os membros e programas (#386)

`GroupSeatPool.mode` = `ALL_MEMBERS` libera o PRO para **todo membro ativo com papel `MEMBER`** da
comunidade, sem atribuir assento um a um. Um **programa** é esse pool com `programName` e data
final (`currentPeriodEnd` + `cancelAtPeriodEnd`): a tela mostra "Durante o <programa>", a data e
os dias que faltam (Al-M5). Quem sai da comunidade volta ao Free sem perder nada.

`pnpm billing:grant-group <slug> [--until AAAA-MM-DD] [--program "Nome"]` liga (cortesia, pool com
`providerRef` nulo); `--revoke` expira. O `--until` vale o dia inteiro: o pool acaba às 23:59:59.999
desse dia em São Paulo, e é esse o dia que a tela mostra. Recusa pool pago. Como o `grant-seat`, é ferramenta de dev,
seed e E2E.

O painel da comunidade vê só **se** o membro tem PRO pela comunidade (`hasAiSeat`), nunca como uma
assinatura pessoal foi paga (teste em `user-isolation.spec.ts`).

### Roteiro de sandbox dos assentos

1. `ASAAS_*` do sandbox no `.env`, a API de pé e o webhook do sandbox apontando para
   `/api/billing/webhooks/asaas` (túnel em dev).
2. Como dono, `POST /groups/<id>/seats/checkout {"seats": 2, "taxId": "<CNPJ de teste>"}` e pagar o
   link no sandbox: o pool vira `ACTIVE`.
3. Atribuir a um membro ativo (`POST …/assignments/<membershipId>`): o "Meu plano" dele mostra
   "PRO pela comunidade".
4. `PATCH {"seats": 4}`: confere a cobrança avulsa proporcional no painel do Asaas; pagar e ver o
   ajuste `ACTIVE`. Deixar vencer outra para ver o atraso e a carência.
5. `PATCH {"seats": 1}` com dois atribuídos: 409. Retirar um, reduzir, e conferir na renovação.

6. Pelo painel (`/org/<id>/seats`): repetir 2 a 5 pela tela e conferir as faturas aparecendo com o
   link do Asaas a cada evento do webhook.

**Não exercitado aqui:** o sandbox real do Asaas (os testes usam um provedor falso). A tela do dono foi
exercitada com o pool de cortesia do seed.

## Custo da mídia da comunidade (Fase 7)

As imagens e, na 7b, os vídeos que as comunidades publicam ficam no Cloudflare R2 (ADR 028). O R2 não
cobra saída; o custo é armazenamento (US$ 0,015/GB-mês, com 10 GB grátis) e operações. Imagem sai do
`sharp` com algumas centenas de KB; vídeo vai até 200 MB e não é convertido. Hoje nada disso entra no
preço do assento: os limites por arquivo são o freio, e um teto por comunidade entra se o uso pedir.

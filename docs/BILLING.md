# Cobrança — empacotamento

> **Escopo deste documento:** o **add-on de insights** (#160), o **cálculo da cobrança por aluno
> ativo** (#158) e o **plano PRO do usuário** ([ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md),
> seção [Plano PRO](#plano-pro-do-usuário-adr-024) no fim). O plano PRO tem persistência completa
> (assinatura, webhook, idempotência); a cobrança de grupo ainda só tem o cálculo.

## Linhas de receita

| Item                                | Cobrança                    | Cancelamento         | Estado               |
| ----------------------------------- | --------------------------- | -------------------- | -------------------- |
| Assinatura base (por aluno ativo)   | mensal, proporcional ao uso | encerra o grupo      | #158, cálculo pronto |
| Add-on de insights de comportamento | mensal, **preço fixo**      | independente da base | #160, esta fatia     |

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

**O portão é um só e fica em `ai/`.** `AiAccessService.assertPodeUsar` roda antes de qualquer
chamada ao agente (`chat.service.ts` e `meal-recognition.service.ts`) e responde 402
`AI_PLAN_REQUIRED` a quem está no Free; depois dele vem a cota (#135), que vale também para o PRO. O
guarda estático `ai/__tests__/hosted-ai-requires-plan.spec.ts` falha se um caminho novo chamar o
agente sem passar pelo portão. As telas leem `allowed` + `reason` de `/chat/availability` e
`/nutrition/photo-recognition` e mostram o cadeado; o plano em si é lido em `GET /billing/plan`,
nunca em `/users/me` (os domínios do aluno não importam `billing/`).

**Self-host continua livre.** `AI_REQUIRES_PLAN=false` (padrão) faz o direito sair `PRO` com origem
`INSTANCE` para todo mundo. A instância pública liga `true`.

## Uma tabela, quatro origens

`UserSubscription` guarda a assinatura de qualquer origem; o direito sai da **leitura** das datas
(`billing/ai-entitlement.ts`, função pura), sem job de expiração:

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

## Web: Asaas

1. `POST /billing/checkout { interval, cpf }` — o CPF é validado pelos dígitos, vai para o Asaas
   (que exige CPF para emitir) e **não é gravado**; guardamos só `User.asaasCustomerId`.
2. A API cria `POST /v3/subscriptions` com `billingType: UNDEFINED` (Pix, boleto ou cartão, a
   pessoa escolhe na fatura), grava a linha `PENDING` com o `invoiceUrl` da primeira cobrança e
   devolve o plano. Tocar de novo em menos de 24 h devolve o mesmo link; trocar de mensal para
   anual cancela o pendente antes.
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
   (`ACCOUNT_DELETION_HOOKS`). Se o Asaas falhar, a exclusão aborta: ninguém é cobrado depois de
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
assinou pela web vê o plano e é orientado a gerenciar pela web.

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

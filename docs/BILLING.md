# Cobrança — empacotamento

> **Escopo deste documento hoje:** só o **add-on de insights** (#160). O motor de cobrança —
> assinatura por aluno, fatura, inadimplência, cancelamento — é a #158 e ainda não existe. Este
> arquivo nasce aqui porque a #160 precisa registrar **o preço e o empacotamento**, que são
> decisão de produto, não de infraestrutura de pagamento.

## Linhas de receita

| Item                                | Cobrança                    | Cancelamento         | Estado             |
| ----------------------------------- | --------------------------- | -------------------- | ------------------ |
| Assinatura base (por aluno ativo)   | mensal, proporcional ao uso | encerra o grupo      | #158, não iniciada |
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

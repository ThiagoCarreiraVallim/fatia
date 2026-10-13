# ADR 024 — Plano Free e Pago do usuário: a IA hospedada passa a ser vendida

**Status:** Proposed
**Data:** 2026-10-13

## Contexto

Até aqui a doutrina do produto era "grátis para o aluno, nunca vende". Ela está escrita em três
lugares que se reforçam:

- `apps/api/src/ai/ai-quota.ts` — "a cota degrada, não vende";
- `apps/api/src/billing/ai-tier.ts` — a IA hospedada só existe quando uma academia paga (#158);
- os Termos da instância pública (`apps/web/src/app/(public)/terms/page.tsx`) — "não há plano pago".

E um teste a protege: `billing/__tests__/no-billing-in-student-surface.spec.ts`.

O novo direcionamento ([`NOVO_DIRECIONAMENTO.md`](../NOVO_DIRECIONAMENTO.md)) muda o modelo de
negócio: o usuário comum também pode pagar, um valor baixo, para ter a IA hospedada. Quem não paga
continua com o app inteiro e com o MCP — a IA dele, na assinatura dele (ADR 006, ADR 018).

O que a IA hospedada é hoje: o chat (`chat/chat.service.ts#converse`), o ditado
(`#transcrever`) e o reconhecimento de refeição por foto (`nutrition/meal-recognition.service.ts`).
Nenhum dos três passa por tool MCP (ADR 018).

## Decisão

**Dois planos por usuário: `FREE` e `PRO`.**

|                                                                    | FREE | PRO           |
| ------------------------------------------------------------------ | ---- | ------------- |
| Registro de refeição, treino, água, peso, passos, metas, progresso | ✅   | ✅            |
| MCP (conector da IA do próprio usuário)                            | ✅   | ✅            |
| Comunidades, desafios, timeline                                    | ✅   | ✅            |
| Chat com IA hospedada, ditado, foto de refeição                    | ❌   | ✅ (com cota) |

1. **O plano só governa IA hospedada.** Nenhuma função de registro, leitura ou exportação de dado
   fica atrás de pagamento. Exportar e apagar a conta continuam livres (LGPD).
2. **Um ponto de decisão:** `BillingEntitlements.aiTierForUser(userId)`, que devolve o maior nível
   entre (a) a assinatura pessoal ativa (`UserSubscription`) e (b) um assento de comunidade ativo
   (ADR 025). `decideAiTier` continua sendo a regra de carência/inadimplência, aplicada às duas
   fontes.
3. **O gate fica na API, antes da cota.** `assertAiEntitled` roda antes de `assertDentroDaCota` em
   todo caminho de IA hospedada, e responde `402 AI_PLAN_REQUIRED`. A cota diária
   (`ai-quota.ts`) continua existindo, agora dimensionada por plano — ela protege a margem, o plano
   protege o acesso.
4. **Inadimplência degrada para FREE, nunca bloqueia o app** — a mesma regra do `ai-tier.ts`.
5. **Uma tabela de assinatura para todas as origens** (`UserSubscription.source`: `ASAAS`, `APPLE`,
   `GOOGLE`). Web cobra via Asaas (Pix/cartão); o app nativo vende por compra in-app (exigência das
   lojas), com o RevenueCat unificando Apple e Google. Webhooks idempotentes
   (`BillingWebhookEvent`).
6. **O MCP continua sem vocabulário de cobrança.** `no-billing-in-student-surface.spec.ts` é
   reescrito: segue reprovando preço/assinatura/checkout em tools MCP, e passa a permitir o
   `BillingController` próprio.

Esta ADR **supera** a frase "nunca vira cobrança" dos Termos e dos comentários citados, que são
atualizados junto com a implementação.

## Consequências

### Positivas

- Receita que não depende de B2B, com custo de inferência coberto por quem consome.
- O Free continua completo para quem traz a própria IA — o caminho de melhor margem (ADR 018)
  continua sendo o default.

### Negativas

- O app precisa ser bom **sem** IA: registro rápido deixa de ser opcional (Fase 3 do plano).
- Duas integrações de pagamento (Asaas e RevenueCat) e reconciliação entre elas.
- Termos, Privacidade e o texto da landing mudam.

### Neutras

- `AiUsage` ganha `paidBy` (`USER`, `GROUP`, `FREE`) para separar a margem por origem.

## Alternativas consideradas

- **Créditos avulsos de IA:** rejeitado — preço difícil de entender e mais atrito que uma
  assinatura simples.
- **Free com um pouco de IA hospedada:** fica em aberto como experimento de conversão, mas não
  é o default — vira só um número na cota do FREE, sem mudar este desenho.

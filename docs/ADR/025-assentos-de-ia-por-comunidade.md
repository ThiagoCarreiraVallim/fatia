# ADR 025 — Comunidades pagam a IA por assentos escolhidos

**Status:** Proposed
**Data:** 2026-10-13

## Contexto

`docs/BILLING.md` (#158) desenhou a cobrança B2B **por aluno ativo**: todo `MEMBER` de grupo
`SPONSORED` que registrou algo nos últimos 30 dias entra na fatura, pró-rata. Grupo `SOCIAL`
(influencer) nunca é faturado (`close-cycle.ts` lança `GrupoNaoFaturavelError`).

O novo direcionamento pede outra coisa: a academia **ou o influencer** decide **para quais
membros** paga o plano PRO (ADR 024). Influencer quer premiar os mais engajados; academia quer
custo previsível por plano contratado.

## Decisão

1. **Assento** é a unidade de cobrança B2B: `GroupSeatPool` (grupo, quantidade, status,
   referência no provedor, fim do período) e `GroupSeatAssignment` (pool, membership, atribuído
   em, revogado em). Uma membership tem no máximo um assento ativo.
2. **Quem atribui:** papéis com `billing.manage` (hoje só `OWNER`), pelo dashboard web.
3. **Qualquer tipo de grupo pode comprar assentos** — `SPONSORED` e `SOCIAL`. A distinção entre os
   dois passa a ser só de apresentação e de defaults (academia: entrada com aprovação; influencer:
   aberta).
4. **O assento é uma fonte de `aiTierForUser`** (ADR 024). Membro com assento ativo = PRO, pago
   pelo grupo; o `AiUsage` registra `paidBy=GROUP` e `groupId`.
5. **Inadimplência do grupo degrada os assentos para FREE** com a carência de `decideAiTier`, e
   nunca remove o membro nem esconde dado.
6. Quem já é PRO pessoal e recebe assento continua PRO; a assinatura pessoal não é cancelada
   automaticamente (o app sugere, não decide).
7. O cálculo de aluno ativo (`active-student.ts`) continua útil como **métrica** do dashboard, não
   mais como base de cobrança.

## Consequências

### Positivas

- Custo previsível para o dono e alavanca de engajamento ("ganhe IA ficando no top 10").
- Influencer passa a ser cliente pagante.

### Negativas

- Mais UI no dashboard (comprar, ajustar, atribuir, revogar).
- `BILLING.md` e partes de `close-cycle.ts` são reescritos.

### Neutras

- Mudar a quantidade de assentos no meio do ciclo segue a regra de pró-rata em centavos inteiros
  que `close-cycle.ts` já implementa.

## Alternativas consideradas

- **Por membro ativo (desenho da #158):** rejeitado como padrão — custo imprevisível e sem escolha
  de quem recebe IA.
- **Os dois modelos convivendo:** rejeitado por ora — dobra a superfície de cobrança sem demanda
  comprovada.

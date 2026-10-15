# ADR 025 — Comunidades pagam a IA por assentos escolhidos

**Status:** Accepted
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

## Atualização — decisões da implementação (2026-10-15)

- **Preço:** R$ 14,90 por assento por mês (`BILLING_SEAT_MONTHLY_CENTS=1490`), 25% abaixo do PRO
  individual, sem mínimo de assentos. Cobrança recorrente mensal no Asaas (Pix, boleto ou cartão),
  com o CPF ou CNPJ de quem paga usado só na criação do cliente, sem ser guardado.
- **Um pool por comunidade** (`GroupSeatPool.groupId` único). Reativar depois de cancelar reusa a
  mesma linha.
- **Aumento no meio do ciclo vale na hora** e gera uma cobrança avulsa proporcional aos dias que
  faltam (`GroupSeatAdjustment`); a recorrente passa ao valor novo. Abaixo do mínimo do Asaas
  (R$ 5,00) a diferença não é cobrada.
- **Redução vale na renovação** (`nextPeriodSeats`) e só é aceita se os assentos atribuídos
  couberem no total novo — o dono tira o assento de alguém antes, nunca o sistema.
- **Assento só para membership `ACTIVE`.** Sair ou ser removido da comunidade revoga o assento na
  mesma transação.
- **Webhook único** (`/billing/webhooks/asaas`): o evento procura a assinatura pessoal, depois o
  pool, depois o ajuste avulso; a regra de cada evento é a mesma do PRO pessoal (carência de 7 dias).
- **PRO pessoal e assento:** a pessoa continua PRO; o uso de IA é atribuído à assinatura pessoal
  (`paidBy=USER`), para a comunidade não pagar por quem já paga.
- Criar a comunidade, convidar e comprar/atribuir assentos ficam na API nesta fase; as telas
  chegam com o painel da Fase 6.

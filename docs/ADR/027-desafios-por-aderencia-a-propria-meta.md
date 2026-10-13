# ADR 027 — Desafios de nutrição medem aderência à própria meta, nunca o valor

**Status:** Proposed
**Data:** 2026-10-13

## Contexto

`social/challenge-metric.ts` fecha os desafios em métricas de **atividade** (`WORKOUT_SESSIONS`,
`STEPS`, `WATER_ML`, `ACTIVE_DAYS`) e `no-body-comparison.spec.ts` reprova qualquer métrica de corpo
ou de alimentação — comparar o que cada um come é gatilho conhecido (#161).

O novo direcionamento pede competição "de quem bate metas de caloria". O pedido é sobre **bater a
meta**, não sobre comer mais ou menos que o outro.

## Decisão

1. Novas métricas de **aderência**, binárias por dia e sempre contra a meta **da própria pessoa**
   (`UserGoals`, `NutrientTarget`):
   - `KCAL_IN_RANGE_DAYS` — dias em que as calorias ficaram dentro da faixa da pessoa;
   - `PROTEIN_TARGET_DAYS` — dias em que a proteína atingiu o mínimo da pessoa;
   - `STREAK_DAYS` — dias consecutivos com registro.
2. **O placar só expõe a contagem de dias.** Nenhuma tela, rota, tool ou export de desafio mostra
   kcal, gramas, peso ou a própria meta de outra pessoa. A função de score recebe só o booleano do
   dia.
3. Dia sem meta configurada não conta (nem a favor, nem contra), e a tela de entrada no desafio
   avisa isso.
4. `no-body-comparison.spec.ts` passa a aceitar essas métricas e a reprovar qualquer campo de valor
   bruto na saída do placar. Peso e medidas continuam proibidos.
5. Participação em desafio é opt-in e o ranking só é visível para quem participa (decisão já
   registrada no PR #244).

## Consequências

### Positivas

- A competição pedida existe sem expor quanto cada um come.
- Incentiva configurar metas — melhora o produto para o usuário Free também.

### Negativas

- Quem define uma faixa larga "ganha" fácil. Mitigação: a equipe pode exigir metas aprovadas por
  profissional nos desafios (configuração do desafio, futuro).

### Neutras

- O cálculo reaproveita o resumo diário de nutrição que já existe.

## Alternativas consideradas

- **Ranking por valor bruto (ex.: mais proteína):** rejeitado — expõe dado de saúde a outros
  membros e reverte a proteção da #161.

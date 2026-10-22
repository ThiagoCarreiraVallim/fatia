# ADR 027 — Desafios de nutrição medem aderência à própria meta, nunca o valor

**Status:** Accepted (implementada na Fase 8a, 18/10/2026)
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

## Implementação (Fase 8a, 18/10/2026)

- **Schema.** `enum ChallengeMetric` com as sete métricas (o teste confere que é a mesma lista de
  `social/challenge-metric.ts`), `GroupChallenge` (janela `startsAt`–`endsAt` no fuso da
  comunidade, `endedEarlyAt`, `scoredAt`, `finalizedAt`) e `GroupChallengeParticipant` (pela
  associação: sair da comunidade tira do placar; `displayName`, `score`, `finalRank`).
  `GroupMembership.displayName` guarda o apelido para os próximos desafios.
- **Onde mora a refeição.** `social/` continua proibido de tocar em refeição. A aderência é
  calculada em `nutrition/daily-adherence.service.ts`, que devolve **só conjuntos de datas** (dia
  na faixa de kcal, dia com proteína no mínimo, dia com registro). O placar recebe a contagem. A
  meta usada é a **atual** da pessoa (`UserGoals` não guarda histórico).
- **`STREAK_DAYS`** é a maior sequência de dias seguidos, dentro da janela, com algum registro
  (refeição, treino concluído, passos ou água).
- **Recálculo** na leitura, quando o placar tem mais de 5 minutos, e encerramento de hora em hora
  num `setInterval` (o repositório evita `@nestjs/schedule`). Quem fecha grava `finalizedAt`
  primeiro com `updateMany … where finalizedAt null`: com várias instâncias, só uma grava as
  posições. O desafio vencido que ninguém fechou fecha na primeira leitura.
- **Quem vê o quê.** Membro ativo lista, entra e sai (`challenge.join`); a equipe
  (`challenge.manage`: dono, profissional, criador) marca, muda antes de começar, encerra e apaga
  antes de começar. O ranking (`apelido, pontuação, posição, isMe, medalha`) só vai para quem
  participa — a equipe vê a contagem de participantes, como qualquer membro.
- **Medalhas.** Ao encerrar, as três primeiras posições com pontuação acima de zero ganham ouro,
  prata e bronze (empate divide a medalha). O catálogo de conquistas ganha `challenge_finished`
  (concluir um desafio pontuando) e `challenge_podium` (subir ao pódio).
- **MCP.** `list_group_challenges`, `get_challenge_leaderboard` e `join_group_challenge`
  (confirmável: publica o apelido para os outros participantes).

## Alternativas consideradas

- **Ranking por valor bruto (ex.: mais proteína):** rejeitado — expõe dado de saúde a outros
  membros e reverte a proteção da #161.
- **Recálculo agendado com `@nestjs/schedule`** (o plano original): dependência nova para um job de
  hora em hora que um `setInterval` com claim atômico resolve; o repositório já evitou o pacote
  pelo mesmo motivo (`oauth-facade.service.ts`).
- **Ranking aberto a toda a comunidade:** expõe quem participa e quanto pontua a quem não entrou;
  o opt-in perderia o sentido.

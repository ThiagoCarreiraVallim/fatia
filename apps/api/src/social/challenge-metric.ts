/**
 * Métricas que um desafio de grupo pode medir.
 *
 * **Nenhuma compara corpo ou alimentação entre pessoas, e a ausência é a
 * proteção de produto — não uma decisão de tela.** Comparar peso, medida ou o
 * que cada um come é gatilho conhecido em app de fitness (#161). Se a regra
 * morasse na UI, seria sugestão: bastaria um formulário novo para reintroduzir
 * "quem perdeu mais peso". Aqui ela é fechada na origem — acrescentar
 * `WEIGHT_LOSS` quebra `no-body-comparison.spec.ts` e obriga quem quebrar a
 * decidir de propósito.
 *
 * As quatro primeiras são de **atividade**. As três de nutrição (ADR 027) são de
 * **aderência**: contam DIAS em que cada pessoa bateu a PRÓPRIA meta, e o placar
 * nunca recebe quanto ela comeu — o cálculo que lê refeição mora fora desta
 * pasta (`nutrition/daily-adherence.service.ts`) e devolve só datas. Por isso
 * toda métrica de nutrição termina em `_DAYS`, e o spec confere.
 *
 * A lista é a mesma do `enum ChallengeMetric` do Prisma, na mesma ordem: o
 * teste de integração dos desafios compara as duas.
 */
export const CHALLENGE_METRICS = [
  /** Sessões de treino concluídas dentro da janela. */
  'WORKOUT_SESSIONS',
  /** Soma dos passos do dia, com o dia valendo o MAIOR log (ADR 007). */
  'STEPS',
  /** Soma de mililitros registrados. Vários copos por dia é o esperado. */
  'WATER_ML',
  /** Dias locais em que houve treino, passos ou água — qualquer um deles. */
  'ACTIVE_DAYS',
  /** Dias com as calorias dentro da faixa da própria pessoa (ADR 027). */
  'KCAL_IN_RANGE_DAYS',
  /** Dias com a proteína no mínimo da própria pessoa (ADR 027). */
  'PROTEIN_TARGET_DAYS',
  /** Maior sequência de dias seguidos com algum registro, dentro da janela. */
  'STREAK_DAYS',
] as const;

export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

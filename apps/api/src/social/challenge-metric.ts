/**
 * Métricas que um desafio de grupo pode medir.
 *
 * **Todas são de ATIVIDADE, e a ausência de valor corporal é a proteção de
 * produto — não uma decisão de tela.** Comparar peso, medida ou alimentação
 * entre pessoas é gatilho conhecido em app de fitness (#161). Se a regra
 * morasse na UI, seria sugestão: bastaria um formulário novo para reintroduzir
 * "quem perdeu mais peso". Aqui ela é fechada na origem — acrescentar
 * `WEIGHT_LOSS` quebra `no-body-comparison.spec.ts` e obriga quem quebrar a
 * decidir de propósito.
 *
 * Nutrição está de fora pelo mesmo motivo que peso: comparar o que cada um come
 * é a mesma classe de gatilho, com outro nome.
 *
 * Esta lista é a **casa provisória** do que o schema deve passar a garantir: a
 * migration proposta na PR cria `enum ChallengeMetric` no Prisma com
 * exatamente estes valores, e este arquivo passa a reexportar o enum gerado. A
 * garantia melhora (vira restrição de coluna); a superfície de teste não muda,
 * porque o spec lê a lista, não o arquivo.
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
] as const;

export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

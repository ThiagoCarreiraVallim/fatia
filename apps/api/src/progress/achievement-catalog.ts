import type { Prisma } from '@prisma/client';

/**
 * Catálogo de conquistas (issue #147).
 *
 * A definição vive em código, não no banco. Guardar título e critério em tabela obrigaria uma
 * migration a cada conquista nova e deixaria duas versões da mesma conquista coexistindo — a do
 * banco de quem desbloqueou ontem e a do deploy de hoje. O banco guarda só o fato: quem, qual
 * chave, quando, e o contexto para a tela contar a história.
 *
 * As sete da issue, duas dos desafios da comunidade (Fase 8a) e "100 treinos" (#382). O catálogo
 * é fechado em dez (decisão do dono, #382), na ordem da prancha Al-G11. Sem pontos, sem níveis,
 * sem medalha por horário: o tom da épica #146 é "útil, não insistente".
 */

export interface AchievementUnlock {
  /**
   * Quando o critério foi batido de verdade, não quando o app percebeu.
   *
   * A avaliação é retroativa por construção — quem já treinava antes do deploy desbloqueia na
   * primeira abertura —, e carimbar `now()` nesse caso contaria a história errada ("primeiro
   * treino: hoje") para quem treina há um ano.
   */
  unlockedAt: Date;
  context?: Prisma.InputJsonObject;
}

/**
 * O que cada predicado pode consultar. Os campos são funções e não valores porque o snapshot é
 * **preguiçoso**: `AchievementService` só avalia as conquistas que ainda faltam, então a consulta
 * cara de recorde pessoal não roda mais depois que `first_pr` foi desbloqueada — e no estado
 * estável (tudo desbloqueado) a avaliação não faz consulta nenhuma além da lista já carregada.
 */
export interface AchievementSnapshot {
  firstMeal(): Promise<{ at: Date; mealType: string } | null>;
  firstWorkout(): Promise<{ at: Date; planName: string | null } | null>;
  firstPlan(): Promise<{ at: Date; planName: string } | null>;
  firstRecord(): Promise<{
    at: Date;
    exerciseId: number;
    exerciseName: string;
    weightKg: number;
  } | null>;
  firstFullWeek(): Promise<{ weekStart: string; sessions: number; target: number } | null>;
  /** Tamanho da sequência de dias ativos, já com a tolerância aplicada. */
  activeDayStreak(): Promise<number>;
  /** Quando o N-ésimo treino foi concluído (`null` se ainda não chegou lá). */
  nthCompletedWorkout(n: number): Promise<Date | null>;
  /** Treinos concluídos até agora: o "faltam 58" da conquista bloqueada. */
  completedWorkoutCount(): Promise<number>;
  /** O primeiro desafio de comunidade encerrado em que a pessoa pontuou. */
  firstChallengeFinished(): Promise<{ at: Date; challengeTitle: string } | null>;
  /** O primeiro desafio encerrado com a pessoa entre as três primeiras posições. */
  firstPodium(): Promise<{ at: Date; challengeTitle: string; rank: number } | null>;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  /** O que falta, dito para a pessoa, quando ainda está bloqueada ("Conclua 100 treinos"). */
  condition: string;
  evaluate(snapshot: AchievementSnapshot): Promise<AchievementUnlock | null>;
  /** Só nas de contagem: quanto já tem, para a tela dizer "faltam 58". */
  progress?(snapshot: AchievementSnapshot): Promise<AchievementProgress>;
}

/** Conquista de "primeira vez": desbloqueia na data do próprio evento. */
function firstTime<T extends { at: Date }>(
  def: Pick<AchievementDefinition, 'key' | 'title' | 'description' | 'condition'>,
  when: (s: AchievementSnapshot) => Promise<T | null>,
  context?: (event: T) => Prisma.InputJsonObject,
): AchievementDefinition {
  return {
    ...def,
    async evaluate(snapshot) {
      const event = await when(snapshot);
      if (!event) return null;
      return { unlockedAt: event.at, ...(context && { context: context(event) }) };
    },
  };
}

function byStreak(key: string, title: string, minimum: number): AchievementDefinition {
  return {
    key,
    title,
    description: `Você manteve ${minimum} dias ativos seguidos.`,
    condition: `${minimum} dias ativos seguidos`,
    async evaluate(snapshot) {
      const days = await snapshot.activeDayStreak();
      if (days < minimum) return null;
      // Sequência não tem data de evento — ela é o estado de agora. Aqui `now()` é a resposta
      // certa, ao contrário das conquistas de "primeira vez".
      return { unlockedAt: new Date(), context: { days } };
    },
    async progress(snapshot) {
      return { current: await snapshot.activeDayStreak(), target: minimum };
    },
  };
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  firstTime(
    {
      key: 'first_meal',
      title: 'Primeira refeição',
      description: 'Você registrou sua primeira refeição.',
      condition: 'Registre uma refeição',
    },
    (s) => s.firstMeal(),
    (e) => ({ mealType: e.mealType }),
  ),
  firstTime(
    {
      key: 'first_workout',
      title: 'Primeiro treino',
      description: 'Você concluiu sua primeira sessão de treino.',
      condition: 'Conclua um treino',
    },
    (s) => s.firstWorkout(),
    (e) => ({ planName: e.planName }),
  ),
  firstTime(
    {
      key: 'plan_created',
      title: 'Primeiro plano',
      description: 'Você montou seu primeiro plano de treino.',
      condition: 'Monte um plano de treino',
    },
    (s) => s.firstPlan(),
    (e) => ({ planName: e.planName }),
  ),
  firstTime(
    {
      key: 'first_pr',
      title: 'Primeiro recorde',
      description: 'Você superou sua própria carga máxima num exercício.',
      condition: 'Supere sua carga máxima num exercício',
    },
    (s) => s.firstRecord(),
    (e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, weightKg: e.weightKg }),
  ),
  byStreak('streak_7', '7 dias seguidos', 7),
  byStreak('streak_30', '30 dias seguidos', 30),
  {
    key: 'first_full_week',
    title: 'Meta da semana',
    description: 'Você bateu sua meta semanal de treinos numa semana inteira.',
    condition: 'Bata a meta de treinos de uma semana',
    async evaluate(snapshot) {
      const week = await snapshot.firstFullWeek();
      if (!week) return null;
      return {
        // Segunda-feira ao meio-dia UTC: a conquista é da semana, não de um instante dela, e
        // qualquer hora escolhida seria arbitrária. Meio-dia não vira de dia em nenhum fuso.
        unlockedAt: new Date(`${week.weekStart}T12:00:00.000Z`),
        context: { weekStart: week.weekStart, sessions: week.sessions, target: week.target },
      };
    },
  },
  {
    key: 'workouts_100',
    title: '100 treinos',
    description: 'Você concluiu 100 treinos.',
    condition: 'Conclua 100 treinos',
    async evaluate(snapshot) {
      // A data é a do 100º treino, não a da avaliação: quem já tinha 130 quando a conquista
      // chegou (#382) desbloqueia no dia em que de fato passou dos 100.
      const at = await snapshot.nthCompletedWorkout(100);
      return at ? { unlockedAt: at, context: { count: 100 } } : null;
    },
    async progress(snapshot) {
      return { current: await snapshot.completedWorkoutCount(), target: 100 };
    },
  },
  firstTime(
    {
      key: 'challenge_finished',
      title: 'Primeiro desafio',
      description: 'Você concluiu um desafio da sua comunidade.',
      condition: 'Conclua um desafio da comunidade',
    },
    (s) => s.firstChallengeFinished(),
    (e) => ({ challengeTitle: e.challengeTitle }),
  ),
  firstTime(
    {
      key: 'challenge_podium',
      title: 'Desafio no pódio',
      description: 'Você terminou um desafio da sua comunidade entre os três primeiros.',
      condition: 'Fique entre os 3 primeiros de um desafio',
    },
    (s) => s.firstPodium(),
    (e) => ({ challengeTitle: e.challengeTitle, rank: e.rank }),
  ),
];

export const ACHIEVEMENT_KEYS: readonly string[] = ACHIEVEMENT_CATALOG.map((a) => a.key);

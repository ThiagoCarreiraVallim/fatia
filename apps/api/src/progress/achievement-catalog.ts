import type { Prisma } from '@prisma/client';

/**
 * Catálogo de conquistas (issue #147).
 *
 * A definição vive em código, não no banco. Guardar título e critério em tabela obrigaria uma
 * migration a cada conquista nova e deixaria duas versões da mesma conquista coexistindo — a do
 * banco de quem desbloqueou ontem e a do deploy de hoje. O banco guarda só o fato: quem, qual
 * chave, quando, e o contexto para a tela contar a história.
 *
 * São sete, exatamente o que a issue lista. Sem pontos, sem níveis, sem medalha por horário: o
 * tom da épica #146 é "útil, não insistente".
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
  primeiraRefeicao(): Promise<Date | null>;
  primeiroTreino(): Promise<Date | null>;
  primeiroPlano(): Promise<Date | null>;
  primeiroRecorde(): Promise<{
    at: Date;
    exerciseId: number;
    exerciseName: string;
    weightKg: number;
  } | null>;
  primeiraSemanaCompleta(): Promise<{ weekStart: string; sessions: number; target: number } | null>;
  /** Tamanho da sequência de dias ativos, já com a tolerância aplicada. */
  diasAtivosSeguidos(): Promise<number>;
}

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  evaluate(snapshot: AchievementSnapshot): Promise<AchievementUnlock | null>;
}

/** Conquista de "primeira vez": desbloqueia na data do próprio evento. */
function primeiraVez(
  key: string,
  title: string,
  description: string,
  quando: (s: AchievementSnapshot) => Promise<Date | null>,
): AchievementDefinition {
  return {
    key,
    title,
    description,
    async evaluate(snapshot) {
      const at = await quando(snapshot);
      return at ? { unlockedAt: at } : null;
    },
  };
}

function porStreak(key: string, title: string, minimo: number): AchievementDefinition {
  return {
    key,
    title,
    description: `Você manteve ${minimo} dias ativos seguidos.`,
    async evaluate(snapshot) {
      const dias = await snapshot.diasAtivosSeguidos();
      if (dias < minimo) return null;
      // Sequência não tem data de evento — ela é o estado de agora. Aqui `now()` é a resposta
      // certa, ao contrário das conquistas de "primeira vez".
      return { unlockedAt: new Date(), context: { days: dias } };
    },
  };
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  primeiraVez('first_meal', 'Primeira refeição', 'Você registrou sua primeira refeição.', (s) =>
    s.primeiraRefeicao(),
  ),
  primeiraVez(
    'first_workout',
    'Primeiro treino',
    'Você concluiu sua primeira sessão de treino.',
    (s) => s.primeiroTreino(),
  ),
  primeiraVez('plan_created', 'Primeiro plano', 'Você montou seu primeiro plano de treino.', (s) =>
    s.primeiroPlano(),
  ),
  {
    key: 'first_pr',
    title: 'Primeiro recorde',
    description: 'Você superou sua própria carga máxima num exercício.',
    async evaluate(snapshot) {
      const pr = await snapshot.primeiroRecorde();
      if (!pr) return null;
      return {
        unlockedAt: pr.at,
        context: {
          exerciseId: pr.exerciseId,
          exerciseName: pr.exerciseName,
          weightKg: pr.weightKg,
        },
      };
    },
  },
  {
    key: 'first_full_week',
    title: 'Primeira semana completa',
    description: 'Você bateu sua meta semanal de treinos numa semana inteira.',
    async evaluate(snapshot) {
      const semana = await snapshot.primeiraSemanaCompleta();
      if (!semana) return null;
      return {
        // Segunda-feira ao meio-dia UTC: a conquista é da semana, não de um instante dela, e
        // qualquer hora escolhida seria arbitrária. Meio-dia não vira de dia em nenhum fuso.
        unlockedAt: new Date(`${semana.weekStart}T12:00:00.000Z`),
        context: { weekStart: semana.weekStart, sessions: semana.sessions, target: semana.target },
      };
    },
  },
  porStreak('streak_7', 'Uma semana ativa', 7),
  porStreak('streak_30', 'Um mês ativo', 30),
];

export const ACHIEVEMENT_KEYS: readonly string[] = ACHIEVEMENT_CATALOG.map((a) => a.key);

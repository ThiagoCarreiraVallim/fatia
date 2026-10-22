import type { TodaySummary } from './progress';

/**
 * Textos do dashboard que web e mobile mostram iguais. Ficam aqui para não
 * divergirem — e porque são o que a pessoa lê primeiro ao abrir o app.
 */

function timeOfDay(now: Date): string {
  const h = now.getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Primeiro nome, se o nome guardado parece um nome. O provisionamento cai em
 * fallbacks quando o Logto não tem nome (parte local do e-mail, o `sub`,
 * "User") — cumprimentar "Bom dia, A1b2c3." é pior que não usar nome.
 */
function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? '';
  if (!/^\p{L}{2,20}$/u.test(first) || first.toLowerCase() === 'user') return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

export function greetingLine(name: string | null | undefined, now: Date = new Date()): string {
  const who = firstName(name);
  return who ? `${timeOfDay(now)}, ${who}.` : `${timeOfDay(now)}.`;
}

export interface NextWorkoutCopy {
  badge: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * O card de "próximo treino". `sessionHref` existe porque a sessão em
 * andamento mora em `/workout` no PWA e em `/workout/session/:id` no app.
 */
export function nextWorkoutCopy(
  workout: TodaySummary['workout'],
  formatTime: (iso: string) => string,
  { sessionHref = () => '/workout' }: { sessionHref?: (id: string) => string } = {},
): NextWorkoutCopy {
  const { nextPlan, sessionInProgress, completedToday } = workout;

  if (sessionInProgress) {
    return {
      badge: 'Em andamento',
      title: 'Retomar sessão',
      subtitle: `Iniciado às ${formatTime(sessionInProgress.startedAt)}`,
      href: sessionHref(sessionInProgress.id),
    };
  }
  if (completedToday) {
    return {
      badge: 'Treino concluído',
      title: 'Ver histórico',
      subtitle: 'Parabéns!',
      href: '/workout/history',
    };
  }
  if (nextPlan) {
    return {
      badge: 'Próximo treino',
      title: nextPlan.name,
      subtitle: nextPlan.source === 'BLOCK' ? 'Plano do seu bloco' : 'Próximo da sua rotação',
      href: `/workout/plans/${nextPlan.planId}`,
    };
  }
  return {
    badge: 'Próximo treino',
    title: 'Treino livre',
    subtitle: 'Ou crie um plano para seguir',
    href: '/workout',
  };
}

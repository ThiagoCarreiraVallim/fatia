import type { WorkoutSession } from '@fatia/api-client';

/**
 * Contas das telas de treino, fora dos componentes.
 *
 * Elas existem separadas porque são a única parte testável sem aparelho: o
 * harness de teste do app roda em Node e não renderiza React Native
 * (`vitest.config.ts`). Se a estimativa de duração morasse dentro do JSX, a
 * paridade com o PWA só seria verificável olhando a tela.
 */

/** `1h 5min` / `45min` / `—` quando a sessão não terminou. */
export function formatSessionDuration(startedAt: string, completedAt?: string | null): string {
  if (!completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export interface SessionSummary {
  uniqueExercises: number;
  totalSets: number;
  totalVolumeKg: number;
}

export function summarizeSession(session: WorkoutSession): SessionSummary {
  const sets = session.sets ?? [];
  return {
    uniqueExercises: new Set(sets.map((s) => s.exerciseId)).size,
    totalSets: sets.length,
    totalVolumeKg: sets.reduce((acc, s) => {
      if (s.weightKg != null && s.reps != null) return acc + s.weightKg * s.reps;
      return acc;
    }, 0),
  };
}

export interface PlanStats {
  totalSets: number;
  /** Minutos estimados. Mesma heurística do PWA: 5 min por série, piso de 15. */
  estDurationMinutes: number;
  /** Toneladas estimadas, já formatadas com uma casa. */
  estVolumeTon: string;
}

export function estimatePlanStats(items: { targetSets: number }[]): PlanStats {
  const totalSets = items.reduce((acc, i) => acc + i.targetSets, 0);
  return {
    totalSets,
    estDurationMinutes: Math.max(15, totalSets * 5),
    estVolumeTon: (totalSets * 1.5).toFixed(1),
  };
}

/**
 * Troca o item com o vizinho. Devolve a lista original quando o movimento sai
 * das bordas — quem chama pode comparar por referência para saber se mudou.
 */
export function swapAt<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Não tem posição nem total de propósito, desde a #221: o anúncio se conta pela
 * **resposta** da API (`planMoveAnnouncement`). Guardar aqui o índice de destino
 * do toque seria deixar à mão justamente o número errado — a lista pode ter
 * mudado em outro aparelho durante o voo.
 */
export interface PlanMove<T> {
  from: T;
  to: T;
  /** Corpo de `reorderPlanExercises`: cada um recebe o `order` do outro. */
  payload: Array<{ id: string; order: number }>;
}

/**
 * Decide o que fazer num toque de "mover para cima/baixo", ou recusa o toque.
 *
 * A regra mora aqui, e não dentro do JSX, porque o harness do app roda em Node
 * e não renderiza React Native: dentro do componente ela só seria verificável
 * em aparelho.
 *
 * `moveInFlight` recusa o segundo toque enquanto o primeiro não respondeu. Sem
 * isso, dois toques rápidos leem o **mesmo** snapshot e compõem duas trocas que
 * se sobrepõem: em `[A(1), B(2), C(3)]`, "descer A" e depois "descer B" gravam
 * A=2, B=3 e C=2 — dois exercícios com o mesmo `order`. Nada estoura (não há
 * `@@unique([planId, order])`), a lista só passa a ordenar de forma indefinida.
 * A transação garante que cada troca é inteira; não garante que duas trocas
 * concorrentes componham.
 *
 * O `order` do payload é o do **vizinho**, nunca o índice: `addPlanExercise`
 * usa `max + 1` e remover exercício não renumera, então a numeração tem buracos
 * (1, 5, 9) e `order: index` corromperia esses planos em silêncio.
 */
export function planMoveDecision<T extends { id: string; order: number }>(
  exercises: T[],
  index: number,
  delta: -1 | 1,
  opts: { moveInFlight: boolean },
): PlanMove<T> | null {
  if (opts.moveInFlight) return null;
  const targetIndex = index + delta;
  if (index < 0 || index >= exercises.length) return null;
  if (targetIndex < 0 || targetIndex >= exercises.length) return null;

  const from = exercises[index];
  const to = exercises[targetIndex];
  return {
    from,
    to,
    payload: [
      { id: from.id, order: to.order },
      { id: to.id, order: from.order },
    ],
  };
}

/**
 * Aplica a troca no cache, para o card sair do lugar no toque (#221).
 *
 * Troca só o campo `order` dos dois vizinhos, e não a posição no array: o cache
 * continua com a mesma forma que a API devolve, e quem lê ordena por `order`,
 * como a própria tela faz. Mexer na posição do array deixaria o cache com uma
 * ordenação que resposta nenhuma da API tem.
 */
export function applyPlanMove<T extends { id: string; order: number }>(
  exercises: T[],
  move: Pick<PlanMove<T>, 'from' | 'to'>,
): T[] {
  return exercises.map((e) => {
    if (e.id === move.from.id) return { ...e, order: move.to.order };
    if (e.id === move.to.id) return { ...e, order: move.from.order };
    return e;
  });
}

/**
 * Frase do anúncio de acessibilidade, derivada da **resposta** da API.
 *
 * Posição e total não podem sair da lista que estava na tela no toque: outro
 * aparelho pode ter removido um exercício enquanto isso, e a API aceita a troca
 * do mesmo jeito quando os dois ids do corpo seguem no plano. Contando pelo
 * snapshot do toque, quem depende do leitor de tela ouviria "3 de 3" numa lista
 * de 2 — os dois números errados.
 *
 * `null` quando a resposta não traz o exercício movido: anunciar "posição 0" é
 * pior do que ficar calado.
 */
export function planMoveAnnouncement(
  exercises: { id: string; order: number }[],
  movedId: string,
  name: string,
): string | null {
  const ordenados = [...exercises].sort((a, b) => a.order - b.order);
  const posicao = ordenados.findIndex((e) => e.id === movedId) + 1;
  if (posicao === 0) return null;
  return `${name} movido para a posição ${posicao} de ${ordenados.length}`;
}

/** Próxima posição livre de um plano — `order` começa em 1. */
export function nextPlanOrder(exercises: { order: number }[]): number {
  if (exercises.length === 0) return 1;
  return Math.max(...exercises.map((e) => e.order)) + 1;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

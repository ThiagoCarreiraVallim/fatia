import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, configureApiClient, resetApiClient } from '../http';
import { workoutApi } from '../workout';

/**
 * Aqui ficam só verbo, caminho, envelope do corpo e forma da resposta — o que
 * quebraria em silêncio se alguém mexesse no método. A regressão de "duas
 * escritas para uma reordenação" mora nas telas, e o teste dela é
 * `apps/web/src/app/(app)/workout/plans/[id]/__tests__/page.test.tsx`: contar
 * `fetch` aqui seria tautológico, porque `apiFetch` chama `fetch` uma vez por
 * construção.
 */

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

describe('workoutApi.reorderPlanExercises', () => {
  beforeEach(() => {
    // Transporte mínimo: identidade na URL, `fetch` mockado (igual a http.test.ts).
    configureApiClient({
      resolveUrl: (path) => path,
      fetch: fetchMock as unknown as typeof fetch,
    });
    fetchMock.mockResolvedValue(jsonResponse({ id: 'plan-1', exercises: [] }));
  });

  afterEach(() => {
    resetApiClient();
  });

  it('faz PUT no caminho /exercises/reorder', async () => {
    await workoutApi.reorderPlanExercises('plan-1', [{ id: 'pe-1', order: 2 }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/workout/plans/plan-1/exercises/reorder');
    expect(init.method).toBe('PUT');
  });

  it('envolve os itens na chave `exercises`, que é o que o DTO valida', async () => {
    // `ReorderExercisesDto` tem @ValidateNested sobre `exercises`; mandar o
    // array cru na raiz do corpo devolveria 400.
    await workoutApi.reorderPlanExercises('plan-1', [
      { id: 'pe-1', order: 2 },
      { id: 'pe-2', order: 1 },
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      exercises: [
        { id: 'pe-1', order: 2 },
        { id: 'pe-2', order: 1 },
      ],
    });
  });

  it('propaga o erro da API com o status, para a tela poder distinguir os casos', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Plan not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const err = await workoutApi
      .reorderPlanExercises('plan-1', [{ id: 'pe-1', order: 2 }])
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).isNotFound).toBe(true);
  });

  it('devolve o plano completo, não a lista de exercícios', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: 'plan-1',
        userId: 'user-1',
        name: 'Push',
        exercises: [{ id: 'pe-2', order: 1 }],
      }),
    );

    const plan = await workoutApi.reorderPlanExercises('plan-1', [{ id: 'pe-2', order: 1 }]);

    expect(plan.name).toBe('Push');
    expect(plan.exercises).toHaveLength(1);
  });
});

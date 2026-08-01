import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import { workoutApi } from '../workout';

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

  it('gasta uma requisição só — é a regressão que o método existe para evitar', async () => {
    await workoutApi.reorderPlanExercises('plan-1', [
      { id: 'pe-1', order: 2 },
      { id: 'pe-2', order: 1 },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

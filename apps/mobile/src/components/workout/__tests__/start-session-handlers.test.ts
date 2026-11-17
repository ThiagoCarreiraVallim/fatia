import { describe, expect, it, vi } from 'vitest';
import { ApiError, type WorkoutSession } from '@fatia/api-client';
import { startSessionHandlers } from '../start-session-handlers';

/**
 * "Iniciar treino" (#381): o segundo toque chega antes de o botão desabilitar,
 * e a API responde 409 apontando para a sessão que o primeiro acabou de abrir.
 * Abrir de novo empilhava a mesma sessão duas vezes.
 */
function fakeClient() {
  return { setQueryData: vi.fn(), invalidateQueries: vi.fn() };
}

const conflict = (activeSessionId: string) =>
  new ApiError('Já existe uma sessão aberta', 409, { activeSessionId });

describe('startSessionHandlers', () => {
  it('o 409 da sessão que o primeiro toque abriu não abre a tela de novo', () => {
    const open = vi.fn();
    const h = startSessionHandlers(fakeClient(), open);
    h.onSuccess({ id: 's1' } as WorkoutSession, { planId: null, pending: [] });
    h.onError(conflict('s1'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('s1');
  });

  it('o 409 de um treino que já estava aberto leva a ele', () => {
    const open = vi.fn();
    const qc = fakeClient();
    const h = startSessionHandlers(qc, open);
    h.onError(conflict('antiga'));
    expect(open).toHaveBeenCalledWith('antiga');
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workout', 'active'] });
  });

  it('os escolhidos vão para o cache da sessão aberta', () => {
    const qc = fakeClient();
    const pending = [{ id: 3, name: 'Esteira', muscleGroup: 'cardio' }];
    startSessionHandlers(qc, vi.fn()).onSuccess({ id: 's1' } as WorkoutSession, {
      planId: null,
      pending,
    });
    expect(qc.setQueryData).toHaveBeenCalledWith(['workout', 'session', 's1', 'pending'], pending);
  });
});

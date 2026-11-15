import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, type WorkoutSession } from '@fatia/api-client';
import { FinishSessionModal } from '../finish-session-modal';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutApi: { ...actual.workoutApi, finishSession: vi.fn() } };
});

import { workoutApi } from '@fatia/api-client';
const finishSession = vi.mocked(workoutApi.finishSession);

const SESSION: WorkoutSession = {
  id: 's1',
  userId: 'u',
  planId: null,
  startedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
  completedAt: null,
  notes: null,
  sets: [],
};

describe('FinishSessionModal (#377)', () => {
  it('finalizar leva ao "Treino feito!" da sessão, e o botão trava enquanto grava', async () => {
    let resolve!: () => void;
    finishSession.mockReturnValue(
      new Promise((r) => {
        resolve = () => r({ ...SESSION, completedAt: new Date().toISOString() });
      }),
    );
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinishSessionModal open onOpenChange={() => undefined} session={SESSION} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    expect(screen.getByRole('button', { name: /Finalizando/ })).toBeDisabled();
    resolve();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout/session/s1'));
    expect(finishSession).toHaveBeenCalledTimes(1);
  });

  it('sessão que já não existe (cancelada em outra aba) volta ao Treino, não a uma página quebrada', async () => {
    push.mockClear();
    finishSession.mockRejectedValue(new ApiError('Session not found', 404));
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinishSessionModal open onOpenChange={() => undefined} session={SESSION} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Finalizar treino' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
    expect(push).not.toHaveBeenCalledWith('/workout/session/s1');
  });
});

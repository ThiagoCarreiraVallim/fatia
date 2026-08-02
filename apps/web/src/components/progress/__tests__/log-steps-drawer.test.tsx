import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LogStepsDrawer } from '../log-steps-drawer';

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    progressApi: {
      listSteps: vi.fn(),
      createStep: vi.fn(),
      updateStep: vi.fn(),
      deleteStep: vi.fn(),
    },
  };
});

import { progressApi } from '@fatia/api-client';

const listSteps = vi.mocked(progressApi.listSteps);
const createStep = vi.mocked(progressApi.createStep);
const updateStep = vi.mocked(progressApi.updateStep);
const deleteStep = vi.mocked(progressApi.deleteStep);

// Dois registros no mesmo dia: a política do servidor é MAX do dia, então isso
// acontece de verdade — e é onde os rótulos acessíveis colidiam.
const LOGS = [
  {
    id: 's1',
    date: '2026-05-19',
    steps: 9500,
    source: 'MANUAL',
    loggedAt: '2026-05-19T22:00:00.000Z',
    notes: null,
  },
  {
    id: 's2',
    date: '2026-05-19',
    steps: 4200,
    source: 'MANUAL',
    loggedAt: '2026-05-19T13:00:00.000Z',
    notes: null,
  },
];

const EDIT_S1 = 'Editar registro de 9.500 passos, 19 mai';
const EDIT_S2 = 'Editar registro de 4.200 passos, 19 mai';
const DELETE_S1 = 'Apagar registro de 9.500 passos, 19 mai';

function renderDrawer(props: Partial<Parameters<typeof LogStepsDrawer>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LogStepsDrawer open onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, invalidateQueries };
}

describe('LogStepsDrawer', () => {
  beforeEach(() => {
    listSteps.mockResolvedValue({ logs: LOGS });
    createStep.mockResolvedValue(LOGS[0]);
    updateStep.mockResolvedValue(LOGS[0]);
    deleteStep.mockResolvedValue(undefined);
  });

  it('lists the recent logs with the thousands separator', async () => {
    renderDrawer();

    expect(await screen.findByText('9.500 passos')).toBeInTheDocument();
    expect(screen.getAllByText('19 mai')).toHaveLength(2);
  });

  it('gives the two logs of the same day distinct accessible names', async () => {
    renderDrawer();

    expect(await screen.findByRole('button', { name: EDIT_S1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: EDIT_S2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DELETE_S1 })).toBeInTheDocument();
  });

  // `updateStep` nem aceita `date` no api-client, e o service só grava a data
  // quando ela vem — corrigir a contagem não traz o registro para hoje.
  it('sends only the step count on an edit, preserving the original day', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer({ date: '2026-05-20' });

    await user.click(await screen.findByRole('button', { name: EDIT_S1 }));
    await user.clear(screen.getByLabelText(/^Passos$/));
    await user.type(screen.getByLabelText(/^Passos$/), '10200');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateStep).toHaveBeenCalledTimes(1));
    expect(updateStep).toHaveBeenCalledWith('s1', { steps: 10200 });
    expect(updateStep.mock.calls[0][1]).toEqual({ steps: 10200 });
    expect(createStep).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * `Number('')` é `0` e `0 < 0` é falso: sem uma guarda sobre o texto cru, o
   * campo em branco viraria `{ steps: 0 }`. No caminho de edição isso zerava o
   * registro do dia em silêncio, e com a política de MAX do dia o card "Passos
   * hoje" desabava junto.
   */
  it('refuses to turn an empty field into a zeroed log', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: EDIT_S1 }));
    await user.clear(screen.getByLabelText(/^Passos$/));

    const submit = screen.getByRole('button', { name: /salvar alteração/i });
    expect(submit).toBeDisabled();
    await user.click(submit);

    expect(updateStep).not.toHaveBeenCalled();
    expect(createStep).not.toHaveBeenCalled();
  });

  it('refuses the same way on the create path', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const submit = screen.getByRole('button', { name: /^salvar$/i });
    expect(submit).toBeDisabled();
    await user.click(submit);

    expect(createStep).not.toHaveBeenCalled();
  });

  // Um zero digitado de propósito é um dia sem caminhada, e a API aceita
  // (`@Min(0)`): a guarda é sobre o campo vazio, não sobre o valor.
  it('still accepts a zero the user typed on purpose', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/^Passos$/), '0');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createStep).toHaveBeenCalledWith({ steps: 0 }));
  });

  it('still sends the day when creating for a specific date', async () => {
    const user = userEvent.setup();
    renderDrawer({ date: '2026-05-20' });

    await user.type(screen.getByLabelText(/^Passos$/), '7000');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() =>
      expect(createStep).toHaveBeenCalledWith({ steps: 7000, date: '2026-05-20' }),
    );
  });

  it('deletes only after the confirmation, and refreshes every consumer', async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: DELETE_S1 }));
    expect(deleteStep).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(deleteStep).toHaveBeenCalledWith('s1'));
    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['progress', 'steps']);
    expect(keys).toContainEqual(['step-logs']);
    expect(keys).toContainEqual(['dashboard']);
    // A meta de passos é derivada da média dos últimos 7 dias no servidor.
    expect(keys).toContainEqual(['goals']);
  });
});

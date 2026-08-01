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

const LOGS = [
  {
    id: 's1',
    date: '2026-05-19',
    steps: 9500,
    source: 'MANUAL',
    loggedAt: '2026-05-19T22:00:00.000Z',
    notes: null,
  },
];

function renderDrawer(props: Partial<Parameters<typeof LogStepsDrawer>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LogStepsDrawer open onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose };
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
    expect(screen.getByText('19 mai')).toBeInTheDocument();
  });

  // `updateStep` nem aceita `date` no api-client, e o service só grava a data
  // quando ela vem — corrigir a contagem não traz o registro para hoje.
  it('sends only the step count on an edit, preserving the original day', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer({ date: '2026-05-20' });

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 19 mai' }));
    await user.clear(screen.getByLabelText(/^Passos$/));
    await user.type(screen.getByLabelText(/^Passos$/), '10200');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateStep).toHaveBeenCalledTimes(1));
    expect(updateStep).toHaveBeenCalledWith('s1', { steps: 10200 });
    expect(updateStep.mock.calls[0][1]).toEqual({ steps: 10200 });
    expect(createStep).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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

  it('deletes only after the confirmation', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Apagar registro de 19 mai' }));
    expect(deleteStep).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(deleteStep).toHaveBeenCalledWith('s1'));
  });
});

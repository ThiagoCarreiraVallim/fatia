import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LogWaterDrawer } from '../log-water-drawer';

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
      listWater: vi.fn(),
      createWater: vi.fn(),
      updateWater: vi.fn(),
      deleteWater: vi.fn(),
    },
  };
});

import { progressApi } from '@fatia/api-client';

const listWater = vi.mocked(progressApi.listWater);
const createWater = vi.mocked(progressApi.createWater);
const updateWater = vi.mocked(progressApi.updateWater);
const deleteWater = vi.mocked(progressApi.deleteWater);

const LOGS = [
  { id: 'a1', date: '2026-05-17', ml: 500, loggedAt: '2026-05-17T14:00:00.000Z', notes: null },
];

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LogWaterDrawer open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, invalidateQueries };
}

describe('LogWaterDrawer', () => {
  beforeEach(() => {
    listWater.mockResolvedValue({ logs: LOGS });
    createWater.mockResolvedValue(LOGS[0]);
    updateWater.mockResolvedValue(LOGS[0]);
    deleteWater.mockResolvedValue(undefined);
  });

  it('creates a log from a preset and closes the drawer', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(screen.getByRole('button', { name: '+500 mL' }));

    await waitFor(() => expect(createWater).toHaveBeenCalledWith({ ml: 500 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * O caso que a issue temia. `updateWater` aceita `date`, mas o service usa
   * spread condicional: campo ausente não é escrito. Este teste trava a
   * omissão — se alguém passar a mandar `date: hoje` "por simetria com o
   * create", corrigir o volume de anteontem passaria a mover o registro.
   */
  it('sends only the volume on an edit, never a date', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 17 mai' }));
    await user.clear(screen.getByLabelText(/Quantidade personalizada/));
    await user.type(screen.getByLabelText(/Quantidade personalizada/), '350');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateWater).toHaveBeenCalledTimes(1));
    expect(updateWater).toHaveBeenCalledWith('a1', { ml: 350 });
    expect(updateWater.mock.calls[0][1]).toEqual({ ml: 350 });
    expect(createWater).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Os atalhos criam registro novo; durante uma correção eles só confundiriam.
  it('hides the presets while an edit is in progress', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 17 mai' }));

    expect(screen.queryByRole('button', { name: '+500 mL' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar registro de água' })).toBeInTheDocument();
  });

  it('deletes only after the confirmation and refreshes chart, list and dashboard', async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Apagar registro de 17 mai' }));
    expect(deleteWater).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(deleteWater).toHaveBeenCalledWith('a1'));
    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['progress', 'water']);
    expect(keys).toContainEqual(['water-logs']);
    expect(keys).toContainEqual(['dashboard']);
  });

  // Sem mutação otimista: uma falha da API não pode deixar a lista contando uma
  // história que o servidor não conhece.
  it('keeps the old value listed when the API rejects the deletion', async () => {
    deleteWater.mockRejectedValue(new Error('Falha ao apagar'));
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Apagar registro de 17 mai' }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    expect(await screen.findByText('Falha ao apagar')).toBeInTheDocument();
    expect(screen.getByText('500 mL')).toBeInTheDocument();
  });
});

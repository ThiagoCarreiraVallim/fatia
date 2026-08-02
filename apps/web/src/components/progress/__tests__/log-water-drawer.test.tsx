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

/**
 * Três registros no mesmo dia, dois deles com o mesmo volume — o caso normal da
 * água, e o que o mock de um log só escondia. As horas ficam a mais de três
 * horas de distância para que os rótulos continuem distintos em qualquer fuso.
 */
const LOGS = [
  { id: 'a1', date: '2026-05-17', ml: 500, loggedAt: '2026-05-17T14:00:00.000Z', notes: null },
  { id: 'a2', date: '2026-05-17', ml: 250, loggedAt: '2026-05-17T18:30:00.000Z', notes: null },
  { id: 'a3', date: '2026-05-17', ml: 500, loggedAt: '2026-05-17T21:45:00.000Z', notes: null },
];

const EDIT_250 = /^Editar registro de 250 mL, 17 mai/;
const DELETE_250 = /^Apagar registro de 250 mL, 17 mai/;

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

    await user.click(await screen.findByRole('button', { name: EDIT_250 }));
    await user.clear(screen.getByLabelText(/Quantidade personalizada/));
    await user.type(screen.getByLabelText(/Quantidade personalizada/), '350');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateWater).toHaveBeenCalledTimes(1));
    expect(updateWater).toHaveBeenCalledWith('a2', { ml: 350 });
    expect(updateWater.mock.calls[0][1]).toEqual({ ml: 350 });
    expect(createWater).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  /**
   * Água é vários registros por dia por definição, e dois copos de 500 mL na
   * mesma terça são rotina. Com a data sozinha no `aria-label` saíam botões
   * "Apagar registro de 17 mai" idênticos, bem na ação irreversível.
   */
  it('gives every log of the same day a distinct accessible name', async () => {
    renderDrawer();

    await screen.findByRole('button', { name: EDIT_250 });
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((name): name is string => name !== null);

    expect(names).toHaveLength(6);
    expect(new Set(names).size).toBe(6);
  });

  // Os atalhos criam registro novo; durante uma correção eles só confundiriam.
  it('hides the presets while an edit is in progress', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: EDIT_250 }));

    expect(screen.queryByRole('button', { name: '+500 mL' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar registro de água' })).toBeInTheDocument();
  });

  it('deletes only after the confirmation and refreshes chart, list and dashboard', async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: DELETE_250 }));
    expect(deleteWater).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(deleteWater).toHaveBeenCalledWith('a2'));
    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['progress', 'water']);
    expect(keys).toContainEqual(['water-logs']);
    expect(keys).toContainEqual(['dashboard']);
  });

  /**
   * Duas exclusões em sequência faziam o observer da mutação migrar para a
   * segunda, e o erro da primeira nunca chegava à tela: a linha continuava
   * listada, sem mensagem nenhuma, e quem apagou lia isso como "ainda não
   * atualizou". A lista inteira congela enquanto uma exclusão está em voo.
   */
  it('does not let a second deletion start while the first is in flight', async () => {
    let finish: () => void = () => undefined;
    deleteWater.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          finish = () => reject(new Error('Falha ao apagar'));
        }),
    );
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: DELETE_250 }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));
    await waitFor(() => expect(deleteWater).toHaveBeenCalledTimes(1));

    for (const button of screen.getAllByRole('button', { name: /^Apagar registro/ })) {
      expect(button).toBeDisabled();
    }

    finish();

    // E a falha da primeira aparece, em vez de sumir engolida pela segunda.
    expect(await screen.findByText('Falha ao apagar')).toBeInTheDocument();
    expect(deleteWater).toHaveBeenCalledTimes(1);
  });

  // Sem mutação otimista: uma falha da API não pode deixar a lista contando uma
  // história que o servidor não conhece.
  it('keeps the old value listed when the API rejects the deletion', async () => {
    deleteWater.mockRejectedValue(new Error('Falha ao apagar'));
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: DELETE_250 }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    expect(await screen.findByText('Falha ao apagar')).toBeInTheDocument();
    expect(screen.getByText('250 mL')).toBeInTheDocument();
  });
});

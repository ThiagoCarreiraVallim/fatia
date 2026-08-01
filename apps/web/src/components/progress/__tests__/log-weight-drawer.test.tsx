import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LogWeightDrawer } from '../log-weight-drawer';

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
      listWeights: vi.fn(),
      createWeight: vi.fn(),
      updateWeight: vi.fn(),
      deleteWeight: vi.fn(),
    },
  };
});

import { progressApi } from '@fatia/api-client';

const listWeights = vi.mocked(progressApi.listWeights);
const createWeight = vi.mocked(progressApi.createWeight);
const updateWeight = vi.mocked(progressApi.updateWeight);
const deleteWeight = vi.mocked(progressApi.deleteWeight);

const LOGS = [
  { id: 'w1', weightKg: 80, loggedAt: '2026-05-19T09:00:00.000Z', notes: null },
  { id: 'w2', weightKg: 79.4, loggedAt: '2026-05-18T09:00:00.000Z', notes: null },
];

function renderDrawer(props: Partial<Parameters<typeof LogWeightDrawer>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <LogWeightDrawer open onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { onClose, invalidateQueries };
}

describe('LogWeightDrawer', () => {
  beforeEach(() => {
    listWeights.mockResolvedValue({ logs: LOGS });
    createWeight.mockResolvedValue(LOGS[0]);
    updateWeight.mockResolvedValue(LOGS[0]);
    deleteWeight.mockResolvedValue(undefined);
  });

  // Sem `enabled: open` toda página que monta o drawer fechado — o dashboard
  // entre elas — puxaria 30 dias de histórico no primeiro render.
  it('loads the history when open and stays quiet when closed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <LogWeightDrawer open={false} onClose={() => undefined} />
      </QueryClientProvider>,
    );

    expect(listWeights).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={client}>
        <LogWeightDrawer open onClose={() => undefined} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(listWeights).toHaveBeenCalled());
    expect(await screen.findByText('80,0 kg')).toBeInTheDocument();
  });

  it('creates a log and closes the drawer when nothing is being edited', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.type(screen.getByLabelText(/Peso \(kg\)/), '81.2');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(createWeight).toHaveBeenCalledWith({ weightKg: 81.2 }));
    expect(updateWeight).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // O risco número um do porte: se o `id` não chegar ao `mutate`, a correção
  // vira um segundo registro e a lista mostra os dois como se tivesse salvo.
  it('updates the picked log instead of creating a second one', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 19 mai' }));
    const field = screen.getByLabelText(/Peso \(kg\)/);
    expect(field).toHaveValue(80);

    await user.clear(field);
    await user.type(field, '78.5');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateWeight).toHaveBeenCalledTimes(1));
    expect(updateWeight).toHaveBeenCalledWith('w1', { weightKg: 78.5 });
    expect(createWeight).not.toHaveBeenCalled();
    // Editar mantém o drawer aberto: a lista logo abaixo é a confirmação.
    expect(onClose).not.toHaveBeenCalled();
  });

  // `updateWeight` não tem `loggedAt` na assinatura e o service só escreve a
  // data quando ela vem no payload — corrigir o número não muda o dia.
  it('sends only the weight on an edit, preserving the original date', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 18 mai' }));
    await user.clear(screen.getByLabelText(/Peso \(kg\)/));
    await user.type(screen.getByLabelText(/Peso \(kg\)/), '79');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateWeight).toHaveBeenCalledTimes(1));
    expect(updateWeight.mock.calls[0][1]).toEqual({ weightKg: 79 });
  });

  it('invalidates chart, list and dashboard after an edit', async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 19 mai' }));
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    await waitFor(() => expect(updateWeight).toHaveBeenCalledTimes(1));
    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['progress', 'weight']);
    expect(keys).toContainEqual(['weight-logs']);
    expect(keys).toContainEqual(['dashboard']);
  });

  it('deletes only after the confirmation, and invalidates the same three keys', async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Apagar registro de 19 mai' }));
    expect(deleteWeight).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(deleteWeight).toHaveBeenCalledWith('w1'));
    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(['progress', 'weight']);
    expect(keys).toContainEqual(['weight-logs']);
    expect(keys).toContainEqual(['dashboard']);
  });

  it('clears the form when the log being edited is deleted', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 19 mai' }));
    expect(screen.getByLabelText(/Peso \(kg\)/)).toHaveValue(80);

    await user.click(screen.getByRole('button', { name: 'Apagar registro de 19 mai' }));
    await user.click(screen.getByRole('button', { name: /^apagar$/i }));

    await waitFor(() => expect(screen.getByLabelText(/Peso \(kg\)/)).toHaveValue(null));
    expect(screen.getByRole('heading', { name: 'Logar peso' })).toBeInTheDocument();
  });

  // Sem mutação otimista: se a API recusa, a lista tem que continuar contando a
  // verdade que o servidor conhece.
  it('keeps the old value in the list when the API rejects the edit', async () => {
    updateWeight.mockRejectedValue(new Error('Falha ao salvar'));
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Editar registro de 19 mai' }));
    await user.clear(screen.getByLabelText(/Peso \(kg\)/));
    await user.type(screen.getByLabelText(/Peso \(kg\)/), '78.5');
    await user.click(screen.getByRole('button', { name: /salvar alteração/i }));

    expect(await screen.findByText('Falha ao salvar')).toBeInTheDocument();
    expect(screen.getByText('80,0 kg')).toBeInTheDocument();
    expect(screen.queryByText('78,5 kg')).not.toBeInTheDocument();
  });

  it('rejects an invalid weight before touching the API', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.type(screen.getByLabelText(/Peso \(kg\)/), '0');
    await user.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText('Peso inválido')).toBeInTheDocument();
    expect(createWeight).not.toHaveBeenCalled();
  });
});

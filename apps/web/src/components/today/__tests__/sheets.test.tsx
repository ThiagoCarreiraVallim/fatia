import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WaterSheet } from '../water-sheet';
import { WeightSheet } from '../weight-sheet';
import { weightProgress } from './fixture';

/**
 * As folhas de água (Al-H3) e de peso (Al-H4) do Hoje (#373).
 */

const api = vi.hoisted(() => ({
  listWater: vi.fn(),
  createWater: vi.fn(),
  deleteWater: vi.fn(),
  weight: vi.fn(),
  createWeight: vi.fn(),
  updateWeight: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: api.toast }));
vi.mock('@/lib/dias', () => ({ hojeIso: () => '2026-11-14' }));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, progressApi: { ...actual.progressApi, ...api } };
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('folha de água (Al-H3)', () => {
  const log = (id: string, ml: number) => ({
    id,
    ml,
    date: '2026-11-14',
    loggedAt: '2026-11-14T12:00:00.000Z',
  });

  it('mostra o total do dia, quanto falta e os registros', async () => {
    api.listWater.mockResolvedValue({ logs: [log('a', 500), log('b', 300)] });
    wrap(<WaterSheet open onOpenChange={() => undefined} targetMl={2500} />);
    expect(await screen.findByText('800')).toBeInTheDocument();
    expect(screen.getByText('de 2.500 mL · faltam 7 copos')).toBeInTheDocument();
    expect(api.listWater).toHaveBeenCalledWith({ from: '2026-11-14', to: '2026-11-14' });
    expect(screen.getAllByRole('button', { name: /^Apagar registro/ })).toHaveLength(2);
  });

  it('o atalho registra e avisa que se desfaz pela lista', async () => {
    api.listWater.mockResolvedValue({ logs: [] });
    api.createWater.mockResolvedValue(log('c', 500));
    wrap(<WaterSheet open onOpenChange={() => undefined} targetMl={2500} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: '+500' }));
    expect(api.createWater).toHaveBeenCalledWith({ ml: 500 });
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('+500 mL · desfazer na lista'));
  });

  it('em "Ontem", lista e registra no dia anterior', async () => {
    api.listWater.mockResolvedValue({ logs: [] });
    api.createWater.mockResolvedValue(log('d', 1000));
    wrap(<WaterSheet open onOpenChange={() => undefined} targetMl={2500} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Ontem' }));
    await waitFor(() =>
      expect(api.listWater).toHaveBeenCalledWith({ from: '2026-11-13', to: '2026-11-13' }),
    );
    await user.click(screen.getByRole('button', { name: '+1 L' }));
    expect(api.createWater).toHaveBeenCalledWith({ ml: 1000, date: '2026-11-13' });
  });

  it('a lixeira apaga o registro e confirma', async () => {
    api.listWater.mockResolvedValue({ logs: [log('a', 250)] });
    api.deleteWater.mockResolvedValue(undefined);
    wrap(<WaterSheet open onOpenChange={() => undefined} targetMl={2500} />);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: /^Apagar registro de 250 mL/ }));
    expect(api.deleteWater).toHaveBeenCalledWith('a');
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('Registro apagado'));
  });

  it('com a meta batida, diz "meta batida"', async () => {
    api.listWater.mockResolvedValue({ logs: [log('a', 2500)] });
    wrap(<WaterSheet open onOpenChange={() => undefined} targetMl={2500} />);
    expect(await screen.findByText('de 2.500 mL · meta batida')).toBeInTheDocument();
  });
});

describe('folha de peso (Al-H4)', () => {
  it('parte do último peso, anda de 0,1 em 0,1 e compara com a pesagem anterior', async () => {
    api.weight.mockResolvedValue(weightProgress());
    wrap(<WeightSheet open onOpenChange={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Salvar 70,2 kg' })).toBeInTheDocument();
    expect(screen.getByText('0,0 desde ontem')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Menos 0,1 kg' }));
    await user.click(screen.getByRole('button', { name: 'Menos 0,1 kg' }));
    expect(screen.getByText('−0,2 desde ontem')).toHaveClass('text-primary');
    await user.click(screen.getByRole('button', { name: 'Mais 0,1 kg' }));
    await user.click(screen.getByRole('button', { name: 'Mais 0,1 kg' }));
    await user.click(screen.getByRole('button', { name: 'Mais 0,1 kg' }));
    expect(screen.getByText('+0,1 desde ontem')).toHaveClass('text-warning');
    expect(screen.getByText('72,7 → 70,3')).toBeInTheDocument();
  });

  it('sem pesagem hoje, salvar cria um registro novo', async () => {
    api.weight.mockResolvedValue(weightProgress());
    api.createWeight.mockResolvedValue({});
    const onOpenChange = vi.fn();
    wrap(<WeightSheet open onOpenChange={onOpenChange} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Menos 0,1 kg' }));
    await user.click(screen.getByRole('button', { name: 'Salvar 70,1 kg' }));
    expect(api.createWeight).toHaveBeenCalledWith({ weightKg: 70.1 });
    expect(api.updateWeight).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('já pesou hoje: compara com a anterior e salvar corrige o registro de hoje', async () => {
    api.weight.mockResolvedValue(
      weightProgress({
        latest: {
          id: 'w-hoje',
          weightKg: 70.0,
          date: '2026-11-14',
          loggedAt: '2026-11-14T08:00:00Z',
        },
        previous: { weightKg: 70.2, date: '2026-11-13' },
      }),
    );
    api.updateWeight.mockResolvedValue({});
    wrap(<WeightSheet open onOpenChange={() => undefined} />);
    expect(await screen.findByText('−0,2 desde ontem')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar 70,0 kg' }));
    expect(api.updateWeight).toHaveBeenCalledWith('w-hoje', { weightKg: 70 });
    expect(api.createWeight).not.toHaveBeenCalled();
  });

  it('sem nenhum registro, parte de 70 kg e não mostra comparação', async () => {
    api.weight.mockResolvedValue(
      weightProgress({ points: [], latest: null, previous: null, deltaSinceLastKg: null }),
    );
    wrap(<WeightSheet open onOpenChange={() => undefined} />);
    expect(await screen.findByRole('button', { name: 'Salvar 70,0 kg' })).toBeInTheDocument();
    expect(screen.queryByText(/desde/)).toBeNull();
    expect(screen.queryByText('30 dias')).toBeNull();
  });
});

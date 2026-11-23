import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiKey, ApiKeysView, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    apiKeysApi: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
  };
});

import { apiKeysApi } from '@fatia/api-client';
import { toast } from 'sonner';
import IntegrationsPage from '../page';

const chave = (p: Partial<ApiKey> = {}): ApiKey => ({
  id: 'k1',
  name: 'Zapier',
  lastFour: '8f2a',
  scopes: ['INVITES', 'MEMBERS', 'SENDS'],
  createdAt: '2026-11-03T15:00:00Z',
  createdBy: 'Bruno',
  lastUsedAt: null,
  callsThisMonth: 12,
  revokedAt: null,
  ...p,
});

const visao = (p: Partial<ApiKeysView> = {}): ApiKeysView => ({
  keys: [chave()],
  quota: { month: '2026-11', used: 3210, limit: 10_000, renewsOn: '2026-12-01', state: 'ok' },
  ...p,
});

function abrir(v: ApiKeysView = visao(), g: Partial<MyGroup> = {}) {
  ctx.group = grupo(g);
  vi.mocked(apiKeysApi.list).mockResolvedValue(v);
  return renderWithClient(<IntegrationsPage />);
}

describe('painel › integrações e API (#413, Pn-38)', () => {
  afterEach(() => vi.clearAllMocks());

  it('as chaves pelos 4 últimos, a cota do mês e as três receitas', async () => {
    abrir();
    expect(screen.getByRole('heading', { level: 1, name: 'Integrações' })).toBeInTheDocument();
    const tabela = await screen.findByRole('table', { name: 'Chaves de API' });
    expect(within(tabela).getByText('Zapier')).toBeInTheDocument();
    expect(within(tabela).getByText('fatia_live_…8f2a')).toBeInTheDocument();
    expect(within(tabela).getByText('3 nov')).toBeInTheDocument();
    expect(screen.getByText('3.210 de 10.000')).toBeInTheDocument();
    expect(screen.getByText('renova 1 dez')).toBeInTheDocument();
    expect(screen.getByText('chamadas de API neste mês')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Cota do mês' })).toHaveAttribute(
      'aria-valuenow',
      '32',
    );
    expect(screen.getAllByRole('button', { name: /Usar receita/ })).toHaveLength(3);
    expect(screen.getByText(/Dados de saúde só saem com o consentimento/)).toBeInTheDocument();
  });

  it('perto do limite, o aviso de Pn-38b: nada no app muda', async () => {
    abrir(
      visao({
        quota: {
          month: '2026-11',
          used: 9840,
          limit: 10_000,
          renewsOn: '2026-12-01',
          state: 'near',
        },
      }),
    );
    expect(await screen.findByText('9.840 de 10.000')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quase no limite. Ao chegar, as chamadas pausam até 1 dez; nada no app muda.',
      ),
    ).toBeInTheDocument();
  });

  it('sem chave: o vazio da prancha', async () => {
    abrir(visao({ keys: [] }));
    expect(await screen.findByText('Nenhuma chave')).toBeInTheDocument();
    expect(
      screen.getByText('Crie uma para ligar o Fatia ao Zapier, Make ou a sua planilha.'),
    ).toBeInTheDocument();
  });

  it('criar mostra a chave inteira uma vez só, com copiar', async () => {
    vi.mocked(apiKeysApi.create).mockResolvedValue({
      key: chave({ id: 'k2', name: 'Make', lastFour: 'Zz09' }),
      secret: 'fatia_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabZz09',
    });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Criar chave' }));
    const dialogo = await screen.findByRole('dialog');
    const criar = within(dialogo).getByRole('button', { name: 'Criar chave' });
    expect(criar).toBeDisabled();
    await userEvent.type(within(dialogo).getByLabelText('Nome da chave'), 'Make');
    await userEvent.click(criar);
    await waitFor(() => expect(apiKeysApi.create).toHaveBeenCalledWith('g1', { name: 'Make' }));
    const segredo = await screen.findByText('fatia_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabZz09');
    expect(segredo).toBeInTheDocument();
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Já copiei' }));
    await waitFor(() =>
      expect(screen.queryByText('fatia_live_ABCDEFGHIJKLMNOPQRSTUVWXYZabZz09')).toBeNull(),
    );
  });

  it('revogar pede confirmação e vale na hora', async () => {
    vi.mocked(apiKeysApi.revoke).mockResolvedValue(chave({ revokedAt: '2026-11-23T10:00:00Z' }));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Revogar Zapier' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/param na hora/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Revogar' }));
    await waitFor(() => expect(apiKeysApi.revoke).toHaveBeenCalledWith('g1', 'k1'));
    expect(toast).toHaveBeenCalledWith('Chave revogada');
  });

  it('a receita abre o passo a passo com a URL e o cabeçalho', async () => {
    abrir();
    const [primeira] = await screen.findAllByRole('button', { name: /Usar receita/ });
    await userEvent.click(primeira!);
    const passos = await screen.findByRole('list', { name: 'Passo a passo' });
    expect(within(passos).getByText(/\/api\/integrations\/v1\/members/)).toBeInTheDocument();
    expect(within(passos).getByText(/Authorization: Bearer/)).toBeInTheDocument();
  });

  it('quem não é dono não chega a pedir nada à API', () => {
    abrir(visao(), { role: 'ADMIN' });
    expect(screen.getByText('Só o dono cuida das integrações.')).toBeInTheDocument();
    expect(apiKeysApi.list).not.toHaveBeenCalled();
  });
});

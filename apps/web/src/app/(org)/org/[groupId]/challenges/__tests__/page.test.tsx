import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Challenge, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    challengesApi: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      end: vi.fn(),
      remove: vi.fn(),
    },
  };
});

import { challengesApi } from '@fatia/api-client';
import OrgChallengesPage from '../page';

const c = (p: Partial<Challenge>): Challenge => ({
  id: 'c1',
  title: 'Outubro ativo',
  description: null,
  metric: 'ACTIVE_DAYS',
  startDate: '2026-10-12',
  endDate: '2026-10-18',
  status: 'running',
  endedEarly: false,
  participants: 3,
  canManage: true,
  me: null,
  ...p,
});

function abrir(challenges: Challenge[] = []) {
  ctx.group = grupo({ role: 'OWNER' });
  vi.mocked(challengesApi.list).mockResolvedValue({ today: '2026-10-18', challenges });
  vi.mocked(challengesApi.create).mockResolvedValue({
    ...c({}),
    leaderboard: null,
    suggestedDisplayName: 'Dona',
  });
  return renderWithClient(<OrgChallengesPage />);
}

describe('painel › desafios', () => {
  afterEach(() => vi.clearAllMocks());

  it('marca um desafio com a métrica, as datas e o título digitados', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desafio' }));
    await userEvent.type(screen.getByLabelText('Título'), '  Água em dia ');
    await userEvent.click(screen.getByRole('radio', { name: /Água/ }));
    expect(screen.getByLabelText('Começa em')).toHaveValue('2026-10-18');
    await userEvent.type(screen.getByLabelText('Termina em'), '2026-10-24');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar desafio' }));

    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith('g1', {
        title: 'Água em dia',
        description: null,
        metric: 'WATER_ML',
        startDate: '2026-10-18',
        endDate: '2026-10-24',
      }),
    );
  });

  it('fim antes do começo não sai da tela', async () => {
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Novo desafio' }));
    await userEvent.type(screen.getByLabelText('Título'), 'Passos');
    await userEvent.clear(screen.getByLabelText('Começa em'));
    await userEvent.type(screen.getByLabelText('Começa em'), '2026-10-20');
    await userEvent.type(screen.getByLabelText('Termina em'), '2026-10-19');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O fim tem de ser no dia do início ou depois.',
    );
    expect(screen.getByRole('button', { name: 'Marcar desafio' })).toBeDisabled();
  });

  it('em andamento só encerra; marcado edita e apaga; de outra pessoa, nada', async () => {
    abrir([
      c({ id: 'r', title: 'Rodando' }),
      c({ id: 'u', title: 'Marcado', status: 'upcoming', startDate: '2026-10-20' }),
      c({ id: 'o', title: 'Do colega', canManage: false }),
    ]);
    const item = async (titulo: string) =>
      within((await screen.findByText(titulo)).closest('li') as HTMLElement);

    const rodando = await item('Rodando');
    expect(rodando.getByRole('button', { name: 'Encerrar agora' })).toBeInTheDocument();
    expect(rodando.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument();
    const marcado = await item('Marcado');
    expect(marcado.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(marcado.getByRole('button', { name: 'Apagar' })).toBeInTheDocument();
    expect((await item('Do colega')).queryAllByRole('button')).toHaveLength(0);

    await userEvent.click(rodando.getByRole('button', { name: 'Encerrar agora' }));
    vi.mocked(challengesApi.end).mockResolvedValue({
      ...c({ status: 'ended' }),
      leaderboard: null,
      suggestedDisplayName: 'Dona',
    });
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar' }),
    );
    await waitFor(() => expect(challengesApi.end).toHaveBeenCalledWith('g1', 'r'));
  });
});

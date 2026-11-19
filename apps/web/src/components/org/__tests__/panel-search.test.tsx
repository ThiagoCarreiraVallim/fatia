import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grupo } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, panelApi: { search: vi.fn(), counts: vi.fn(), overview: vi.fn() } };
});

import { panelApi } from '@fatia/api-client';
import { PanelSearch } from '../panel-search';

function Abre() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir busca
      </button>
      <PanelSearch group={grupo({ role: 'PROFESSIONAL' })} open={open} onOpenChange={setOpen} />
    </>
  );
}

function abrir() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Abre />
    </QueryClientProvider>,
  );
}

describe('busca ⌘K (Pn2-00)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('agrupa membros, telas e planos; Enter abre e vai para os recentes', async () => {
    const user = userEvent.setup();
    vi.mocked(panelApi.search).mockResolvedValue({
      members: [{ membershipId: 'm1', name: 'Ana Dias', role: 'MEMBER', status: 'ACTIVE' }],
      screens: [],
      plans: [{ id: 't1', title: 'Ana A/B', kind: 'WORKOUT', published: false }],
    });
    abrir();
    await user.click(screen.getByRole('button', { name: 'abrir busca' }));
    expect(screen.getByText('Digite o nome de um membro, uma tela ou um plano.')).toBeVisible();
    expect(screen.getByText(/sem dado de saúde na busca · você é profissional/)).toBeVisible();
    await user.type(screen.getByRole('combobox', { name: 'Buscar' }), 'ana');
    const membros = await screen.findByRole('listbox', { name: 'Membros' });
    expect(within(membros).getByText('Ana Dias')).toBeInTheDocument();
    expect(
      within(screen.getByRole('listbox', { name: 'Planos' })).getByText(
        'plano de treino · rascunho',
      ),
    ).toBeInTheDocument();
    expect(panelApi.search).toHaveBeenCalledWith('g1', 'ana');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(nav.push).toHaveBeenCalledWith('/org/g1/content/plans/t1');
    expect(screen.queryByRole('combobox', { name: 'Buscar' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'abrir busca' }));
    const recentes = screen.getByRole('listbox', { name: 'Recentes' });
    expect(within(recentes).getByText('Ana A/B')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveValue('');
  });

  it('sem resultado diz o que tentar', async () => {
    const user = userEvent.setup();
    vi.mocked(panelApi.search).mockResolvedValue({ members: [], screens: [], plans: [] });
    abrir();
    await user.click(screen.getByRole('button', { name: 'abrir busca' }));
    await user.type(screen.getByRole('combobox', { name: 'Buscar' }), 'zzz');
    expect(await screen.findByText('Nada com “zzz”')).toBeInTheDocument();
  });
});

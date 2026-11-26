import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandChoice } from '@fatia/api-client';
import { grupo, renderWithClient } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  useParams: () => ({ groupId: 'g9' }),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { ...actual.groupsApi, get: vi.fn() },
    orgApi: { ...actual.orgApi, update: vi.fn(), setCover: vi.fn() },
  };
});

import { groupsApi, orgApi } from '@fatia/api-client';
import BrandStepPage from '../page';

/** Passo 2 de quem cria a comunidade (#372, prancha Onb-C2). */
describe('/community/new/[groupId] (Onb-C2)', () => {
  afterEach(() => vi.clearAllMocks());

  it('laranja passa; o roxo é corrigido com aviso e o tom corrigido é o que salva', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo({ id: 'g9' }));
    vi.mocked(orgApi.update).mockResolvedValue({} as never);
    renderWithClient(<BrandStepPage />);

    expect(await screen.findByRole('heading', { name: 'A cara da sua comunidade' })).toBeVisible();
    expect(screen.getByText('Academia Demo')).toBeInTheDocument();
    expect(screen.getByText('Contraste ok para texto e botões')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Roxo' }));
    const roxo = brandChoice('#7c5cff');
    expect(screen.getByText(roxo.warning!)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar e abrir o painel' }));
    await waitFor(() =>
      expect(orgApi.update).toHaveBeenCalledWith('g9', { brandColor: roxo.color }),
    );
    expect(nav.replace).toHaveBeenCalledWith('/org/g9');
  });

  it('outra cor: o verde do Fatia é recusado e não salva', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo({ id: 'g9' }));
    renderWithClient(<BrandStepPage />);
    const outra = await screen.findByLabelText('Outra cor');
    fireEvent.change(outra, { target: { value: '#2ce500' } });
    expect(screen.getByText(/verde do Fatia/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e abrir o painel' })).toBeDisabled();
  });

  it('só o dono passa pela marca', async () => {
    vi.mocked(groupsApi.get).mockResolvedValue(grupo({ id: 'g9', role: 'PROFESSIONAL' }));
    renderWithClient(<BrandStepPage />);
    expect(await screen.findByText(/Só quem criou a comunidade/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar e abrir o painel' })).toBeNull();
  });
});

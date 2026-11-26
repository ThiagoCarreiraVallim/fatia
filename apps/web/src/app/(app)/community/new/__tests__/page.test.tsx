import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { renderWithClient } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { create: vi.fn() },
    setupApi: { ...actual.setupApi, slugCheck: vi.fn() },
  };
});

import { orgApi, setupApi } from '@fatia/api-client';
import NewCommunityPage from '../page';

/** Passo 1 de quem cria a comunidade (#372, prancha Onb-C1). */
describe('/community/new (Onb-C1)', () => {
  afterEach(() => vi.clearAllMocks());

  it('"Criar" só com tipo e nome; manda o tipo, o subtipo e o endereço livre e segue para a Marca', async () => {
    vi.mocked(setupApi.slugCheck).mockResolvedValue({ slug: 'academia-demo', taken: false });
    vi.mocked(orgApi.create).mockResolvedValue({ id: 'g9' } as never);
    renderWithClient(<NewCommunityPage />);

    const criar = screen.getByRole('button', { name: 'Criar' });
    expect(criar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nome'), 'Academia Demo');
    expect(criar).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /Academia/ }));
    expect(criar).toBeEnabled();
    expect(await screen.findByText('academia-demo')).toBeInTheDocument();
    expect(screen.getByText('fat.ia.br/', { exact: false })).toBeInTheDocument();

    await userEvent.click(criar);
    await waitFor(() =>
      expect(orgApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Academia Demo',
          type: 'SPONSORED',
          kind: 'GYM',
          slug: 'academia-demo',
          joinPolicy: 'APPROVAL',
        }),
      ),
    );
    expect(nav.replace).toHaveBeenCalledWith('/community/new/g9');
  });

  it('endereço já usado: mostra o sugerido; influencer vai como social, sem subtipo', async () => {
    vi.mocked(setupApi.slugCheck).mockResolvedValue({ slug: 'box-centro-2', taken: true });
    vi.mocked(orgApi.create).mockResolvedValue({ id: 'g9' } as never);
    renderWithClient(<NewCommunityPage />);
    await userEvent.click(screen.getByRole('radio', { name: /Influencer ou grupo/ }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Box Centro');
    expect(await screen.findByText('box-centro-2')).toBeInTheDocument();
    expect(screen.getByText(/já é de outra comunidade/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(orgApi.create).toHaveBeenCalled());
    const input = vi.mocked(orgApi.create).mock.calls[0]![0];
    expect(input).toMatchObject({ type: 'SOCIAL', slug: 'box-centro-2' });
    expect(input).not.toHaveProperty('kind');
  });

  it('erro da API aparece e não sai da tela', async () => {
    vi.mocked(setupApi.slugCheck).mockResolvedValue({ slug: 'box', taken: false });
    vi.mocked(orgApi.create).mockRejectedValue(new ApiError('Slug já está em uso', 409));
    renderWithClient(<NewCommunityPage />);
    await userEvent.click(screen.getByRole('radio', { name: /Personal ou nutri/ }));
    await userEvent.type(screen.getByLabelText('Nome'), 'Box');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug já está em uso');
    expect(vi.mocked(orgApi.create).mock.calls[0]![0]).toMatchObject({ kind: 'COACH' });
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

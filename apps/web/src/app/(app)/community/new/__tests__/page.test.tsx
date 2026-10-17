import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { renderWithClient } from '@/app/(org)/org/[groupId]/__tests__/helpers';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, orgApi: { create: vi.fn() } };
});

import { orgApi } from '@fatia/api-client';
import NewCommunityPage from '../page';

describe('/community/new', () => {
  afterEach(() => vi.clearAllMocks());

  it('cria com aprovação por padrão e leva aos convites do painel', async () => {
    vi.mocked(orgApi.create).mockResolvedValue({ id: 'g9' } as never);
    renderWithClient(<NewCommunityPage />);
    await userEvent.type(screen.getByLabelText('Nome'), 'Box Centro');
    await userEvent.click(screen.getByRole('button', { name: 'Criar comunidade' }));
    await waitFor(() =>
      expect(orgApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Box Centro', type: 'SPONSORED', joinPolicy: 'APPROVAL' }),
      ),
    );
    expect(nav.replace).toHaveBeenCalledWith('/org/g9/invites');
  });

  it('nome curto não envia; erro da API aparece', async () => {
    vi.mocked(orgApi.create).mockRejectedValue(new ApiError('Slug já está em uso', 409));
    renderWithClient(<NewCommunityPage />);
    await userEvent.type(screen.getByLabelText('Nome'), 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Criar comunidade' }));
    expect(await screen.findByText('Dê um nome com ao menos 2 letras')).toBeInTheDocument();
    expect(orgApi.create).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Nome'), 'ox');
    await userEvent.click(screen.getByRole('button', { name: 'Criar comunidade' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug já está em uso');
  });
});

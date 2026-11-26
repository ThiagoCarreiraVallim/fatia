import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { grupo, membro, renderWithClient } from '../../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    orgApi: { ...actual.orgApi, members: vi.fn() },
    usersApi: { ...actual.usersApi, me: vi.fn() },
  };
});

import { orgApi, usersApi } from '@fatia/api-client';
import WhatYouSeePage from '../page';

/** "O que você vê" do profissional (#372, prancha Onb-E2). */
describe('/org/[groupId]/review/what-you-see (Onb-E2)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cada aluno com o que liberou para você; o acesso registrado leva o seu nome', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(usersApi.me).mockResolvedValue({ id: 'u9', name: 'Helena Souza' } as never);
    vi.mocked(orgApi.members).mockResolvedValue([
      membro({
        name: 'Carla Souza',
        scopesGrantedToMe: ['WORKOUT', 'NUTRITION', 'HABITS', 'GOALS'],
      }),
      membro({ name: 'Diego Lima', scopesGrantedToMe: ['WORKOUT'] }),
      membro({ name: 'Bruno Lima', role: 'OWNER' }),
      membro({ name: 'Saiu Antes', status: 'LEFT' }),
    ]);
    renderWithClient(<WhatYouSeePage />);

    expect(
      await screen.findByRole('heading', { name: 'Você vê só o que cada aluno liberou' }),
    ).toBeVisible();
    // Só alunos ativos; a equipe e quem saiu ficam fora.
    expect(await screen.findByRole('button', { name: /Carla Souza/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.queryByText('Bruno Lima')).toBeNull();
    expect(screen.queryByText('Saiu Antes')).toBeNull();
    const carla = screen.getByRole('list', { name: 'O que Carla Souza liberou' });
    expect(within(carla).getByText('treino')).toBeInTheDocument();
    expect(within(carla).getByText('peso e medidas · bloqueado')).toBeInTheDocument();

    const diego = screen.getByRole('button', { name: /Diego Lima/ });
    expect(diego).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(diego);
    expect(
      within(screen.getByRole('list', { name: 'O que Diego Lima liberou' })).getByText(
        'alimentação · bloqueado',
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText('O aluno vê "Helena abriu sua ficha · 09:12"'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entendi' })).toHaveAttribute('href', '/org/g1/review');
  });

  it('sem alunos ainda: diz o que vai acontecer', async () => {
    ctx.group = grupo({ role: 'PROFESSIONAL' });
    vi.mocked(usersApi.me).mockResolvedValue({ id: 'u9', name: 'Helena' } as never);
    vi.mocked(orgApi.members).mockResolvedValue([]);
    renderWithClient(<WhatYouSeePage />);
    expect(await screen.findByText(/Quando um aluno entrar/)).toBeInTheDocument();
  });
});

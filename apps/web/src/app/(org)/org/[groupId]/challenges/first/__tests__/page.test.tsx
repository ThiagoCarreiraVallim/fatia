import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup } from '@fatia/api-client';
import { detail } from '@/components/challenges/__tests__/fixtures';
import { grupo, renderWithClient } from '../../../__tests__/helpers';

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
  return { ...actual, challengesApi: { list: vi.fn(), create: vi.fn() } };
});

import { challengesApi } from '@fatia/api-client';
import FirstChallengePage from '../page';

function open(g: MyGroup = grupo()) {
  ctx.group = g;
  // 2026-11-26 é quinta: a próxima segunda é 30 nov.
  vi.mocked(challengesApi.list).mockResolvedValue({ today: '2026-11-26', challenges: [] });
  vi.mocked(challengesApi.create).mockResolvedValue(detail());
  return renderWithClient(<FirstChallengePage />);
}

/** Primeiro desafio com modelo (#372, prancha Onb-C5). */
describe('/org/[groupId]/challenges/first (Onb-C5)', () => {
  afterEach(() => vi.clearAllMocks());

  it('publica o "Constância 30 dias" na segunda, com push, e mostra o estado publicado', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Constância 30 dias' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Segunda, 30 nov' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Avisar todos por push' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar desafio' }));
    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith('g1', {
        title: 'Constância 30 dias',
        description: expect.any(String),
        kind: 'METRIC',
        metric: 'ACTIVE_DAYS',
        startDate: '2026-11-30',
        endDate: '2026-12-29',
        notify: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Desafio publicado' })).toBeVisible();
    expect(
      screen.getByText(
        'Constância 30 dias começa segunda, 30 nov. Todos os membros recebem o aviso.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao checklist' })).toHaveAttribute(
      'href',
      '/org/g1',
    );
  });

  it('hoje e sem push; outro modelo da lista', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Ver outros modelos' }));
    await userEvent.click(screen.getByRole('radio', { name: /Água em dia/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Hoje' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Avisar todos por push' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar desafio' }));
    await waitFor(() =>
      expect(challengesApi.create).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({
          title: 'Água em dia',
          kind: 'WATER',
          waterGoalMl: 2000,
          startDate: '2026-11-26',
          endDate: '2026-12-09',
          notify: false,
        }),
      ),
    );
    expect(
      await screen.findByText('Água em dia começa hoje. Sem aviso por push.'),
    ).toBeInTheDocument();
  });

  it('quem não cuida de desafios não publica', async () => {
    open(grupo({ role: 'RECEPTION' }));
    expect(await screen.findByText(/Só quem cuida dos desafios/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar desafio' })).toBeNull();
  });
});

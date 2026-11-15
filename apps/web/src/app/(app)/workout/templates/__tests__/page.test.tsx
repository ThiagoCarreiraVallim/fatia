import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutTemplatesGroup } from '@fatia/api-client';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, workoutTemplatesApi: { listMine: vi.fn() } };
});

import { workoutTemplatesApi } from '@fatia/api-client';
import TemplatesPage from '../page';

const listMine = vi.mocked(workoutTemplatesApi.listMine);

const GROUPS: WorkoutTemplatesGroup[] = [
  {
    group: { id: 'g1', name: 'Academia Demo' },
    templates: [
      {
        id: 't1',
        title: 'Full Body Express',
        level: 'beginner',
        authorName: 'Bruno',
        exerciseCount: 5,
        setCount: 15,
        adoptedPlanId: null,
      },
      {
        id: 't2',
        title: 'Pernas e glúteos',
        level: 'intermediate',
        authorName: 'Bruno',
        exerciseCount: 6,
        setCount: 18,
        adoptedPlanId: 'p1',
      },
    ],
  },
  {
    group: { id: 'g2', name: 'Box Sul CrossFit' },
    templates: [
      {
        id: 't3',
        title: 'Força de base',
        level: null,
        authorName: 'Rafa',
        exerciseCount: 1,
        setCount: 3,
        adoptedPlanId: null,
      },
    ],
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TemplatesPage />
    </QueryClientProvider>,
  );
}

describe('Modelos das comunidades (Al-T23)', () => {
  beforeEach(() => listMine.mockReset());

  it('agrupa por comunidade e cada modelo abre o detalhe da comunidade', async () => {
    listMine.mockResolvedValue(GROUPS);
    renderPage();
    expect(await screen.findByText('2 modelos')).toBeInTheDocument();
    expect(screen.getByText('1 modelo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Full Body Express/ })).toHaveAttribute(
      'href',
      '/community/g1/content/t1',
    );
    expect(screen.getByText('Iniciante')).toBeInTheDocument();
    expect(screen.getByText(/5 exercícios · 15 séries · por Bruno/)).toBeInTheDocument();
    expect(screen.getByText('adotado')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ao adotar, você recebe uma cópia nos seus planos. O original da comunidade não muda.',
      ),
    ).toBeInTheDocument();
  });

  it('o chip da comunidade filtra; "Todas" volta', async () => {
    listMine.mockResolvedValue(GROUPS);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Box Sul CrossFit' }));
    expect(screen.queryByText('Full Body Express')).not.toBeInTheDocument();
    expect(screen.getByText('Força de base')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByText('Full Body Express')).toBeInTheDocument();
  });

  it('sem modelos: leva para as comunidades', async () => {
    listMine.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nenhum modelo nas suas comunidades')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver comunidades' })).toHaveAttribute(
      'href',
      '/community',
    );
  });
});

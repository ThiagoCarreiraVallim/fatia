import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Exercise, GroupExercise } from '@fatia/api-client';

vi.mock('next/navigation', () => ({
  useParams: () => ({ groupId: 'g1' }),
  useSearchParams: () => new URLSearchParams('tab=exercises'),
  usePathname: () => '/community/g1/content',
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/layout/app-top-bar', () => ({ useTopBarTitle: vi.fn() }));
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn().mockResolvedValue({ name: 'Academia Demo' }) },
    groupContentApi: { plans: vi.fn().mockResolvedValue([]), tips: vi.fn().mockResolvedValue([]) },
    groupExerciseApi: { forMember: vi.fn() },
    workoutApi: { getExercise: vi.fn(), cloneExercise: vi.fn() },
  };
});

import { groupExerciseApi, workoutApi } from '@fatia/api-client';
import CommunityContentPage from '../page';

describe('comunidade › exercícios', () => {
  it('lista o catálogo da comunidade e abre o detalhe com o tutorial', async () => {
    vi.mocked(groupExerciseApi.forMember).mockResolvedValue([
      {
        exerciseId: 42,
        name: 'Leg press da casa',
        muscleGroup: 'pernas',
        equipment: 'máquina',
        video: { id: 'v', kind: 'VIDEO', url: 'https://b/v', width: null, height: null },
        photos: [],
      } as unknown as GroupExercise,
    ]);
    vi.mocked(workoutApi.getExercise).mockResolvedValue({
      id: 42,
      name: 'Leg press da casa',
      muscleGroup: 'pernas',
      community: {
        groupId: 'g1',
        groupName: 'Academia Demo',
        video: { id: 'v', kind: 'VIDEO', url: 'https://b/v', width: null, height: null },
        photos: [],
        tips: null,
      },
    } as unknown as Exercise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CommunityContentPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Leg press da casa/ }));
    await waitFor(() => expect(workoutApi.getExercise).toHaveBeenCalledWith(42));
    expect(
      await screen.findByRole('region', { name: 'Tutorial de Academia Demo' }),
    ).toBeInTheDocument();
  });

  it('lista que não carregou diz que falhou, e não que está vazia', async () => {
    vi.mocked(groupExerciseApi.forMember).mockRejectedValue(new Error('rede'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CommunityContentPage />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Não deu para carregar os exercícios')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum exercício ainda')).toBeNull();
  });
});

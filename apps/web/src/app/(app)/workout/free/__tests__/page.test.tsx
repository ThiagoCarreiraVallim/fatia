import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, type Exercise, type WorkoutSession } from '@fatia/api-client';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import FreeWorkoutPage from '../page';

/** Treino livre (Al-T17b, #381): monta na hora, o relógio só anda no "Iniciar". */

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/workout/free',
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
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
    workoutApi: {
      searchExercises: vi.fn(),
      startSession: vi.fn(),
      getActiveSession: vi.fn().mockResolvedValue(null),
    },
    groupsApi: { mine: vi.fn().mockResolvedValue([]) },
    usersApi: { me: vi.fn().mockResolvedValue({}) },
  };
});

import { workoutApi } from '@fatia/api-client';

const searchExercises = vi.mocked(workoutApi.searchExercises);
const startSession = vi.mocked(workoutApi.startSession);

const ex = (id: number, name: string, muscleGroup: string, favorite = false): Exercise =>
  ({ id, name, muscleGroup, source: 'SEED', favorite }) as Exercise;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TopBarProvider>
        <AppTopBar />
        <FreeWorkoutPage />
      </TopBarProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe('Treino livre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = '';
    searchExercises.mockResolvedValue([
      ex(1, 'Supino reto com barra', 'peito', true),
      ex(2, 'Puxada frente', 'costas'),
      ex(3, 'Esteira', 'cardio'),
    ]);
  });

  it('abre vazio e não começa nada: o botão espera o primeiro exercício', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Treino livre' })).toBeInTheDocument();
    expect(screen.getByText('Adicione o primeiro exercício')).toBeInTheDocument();
    expect(screen.getByText('livre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar treino/ })).toBeDisabled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('sugeridos com favoritos primeiro; tocar adiciona, o X tira', async () => {
    const user = userEvent.setup();
    renderPage();
    const fav = await screen.findByRole('button', {
      name: 'Adicionar Supino reto com barra (favorito)',
    });
    await user.click(fav);
    await user.click(screen.getByRole('button', { name: 'Adicionar Esteira' }));
    const list = screen.getByRole('list', { name: 'Exercícios do treino' });
    expect(list).toHaveTextContent('Supino reto com barra');
    expect(list).toHaveTextContent('Esteira');
    // O escolhido sai dos sugeridos.
    expect(screen.queryByRole('button', { name: /Adicionar Esteira/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Iniciar treino · 2 exercícios' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remover Esteira' }));
    expect(screen.getByRole('button', { name: 'Iniciar treino · 1 exercício' })).toBeEnabled();
  });

  it('"Iniciar" abre a sessão sem plano e leva os escolhidos como pendentes', async () => {
    startSession.mockResolvedValue({ id: 'sessao-1' } as WorkoutSession);
    const user = userEvent.setup();
    const client = renderPage();
    await user.click(await screen.findByRole('button', { name: /Adicionar Esteira/ }));
    await user.click(screen.getByRole('button', { name: 'Iniciar treino · 1 exercício' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
    expect(startSession.mock.calls[0]![0].planId).toBeUndefined();
    expect(startSession.mock.calls[0]![0].startedAt).toEqual(expect.any(String));
    expect(client.getQueryData(['workout', 'session', 'sessao-1', 'pending'])).toEqual([
      { id: 3, name: 'Esteira', muscleGroup: 'cardio' },
    ]);
  });

  it('com um treino já aberto (409), cai nele sem misturar os escolhidos', async () => {
    startSession.mockRejectedValue(new ApiError('aberta', 409, { activeSessionId: 'outra' }));
    const user = userEvent.setup();
    const client = renderPage();
    await user.click(await screen.findByRole('button', { name: /Adicionar Esteira/ }));
    await user.click(screen.getByRole('button', { name: 'Iniciar treino · 1 exercício' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/workout'));
    expect(client.getQueryData(['workout', 'session', 'outra', 'pending'])).toBeUndefined();
  });

  it('"Só cardio" (?add=cardio) abre o Adicionar exercício já em Cardio', async () => {
    search = 'add=cardio';
    renderPage();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await waitFor(() =>
      expect(searchExercises).toHaveBeenCalledWith(undefined, 'cardio', expect.anything()),
    );
  });
});

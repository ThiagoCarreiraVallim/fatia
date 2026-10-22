import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Exercise } from '@fatia/api-client';
import QuickTemplatePage from '../page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ templateId: 'full-body' }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function exercise(id: number, name: string, muscleGroup: string): Exercise {
  return {
    id,
    name,
    muscleGroup,
    source: 'SEED',
    createdByUserId: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: null,
    level: null,
    mechanic: null,
    instructions: [],
    youtubeVideoId: null,
    youtubeVideoIdPt: null,
  };
}

const ESTEIRA = exercise(99, 'Esteira', 'cardio');

// O drawer de busca vira um botão que entrega a esteira: o que se prova aqui é
// o que a página faz com o exercício escolhido.
vi.mock('@/components/workout/add-exercise-drawer', () => ({
  AddExerciseDrawer: ({ onAdd }: { onAdd: (e: Exercise) => void }) => (
    <button type="button" onClick={() => onAdd(ESTEIRA)}>
      escolher esteira
    </button>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: {
      ...actual.workoutApi,
      searchExercises: vi.fn(),
      getPersonalRecord: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const searchExercises = vi.mocked(workoutApi.searchExercises);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickTemplatePage />
    </QueryClientProvider>,
  );
}

describe('QuickTemplatePage', () => {
  beforeEach(() => {
    getPersonalRecord.mockResolvedValue(null);
    // Um exercício por busca, com id próprio: o modelo descarta id repetido.
    const names = ['agachamento', 'supino', 'remada', 'desenvolvimento'];
    searchExercises.mockImplementation(async (query = '') => [
      exercise(names.indexOf(query) + 1, query, 'pernas'),
    ]);
  });

  it('cardio adicionado entra com uma série, e o total de séries acompanha', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('12 séries planejadas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'escolher esteira' }));

    // "3 × 8-12" numa esteira viraria três séries que a sessão nunca pede.
    expect(await screen.findByText('13 séries planejadas')).toBeInTheDocument();
  });

  it('anuncia a nova posição ao mover um exercício', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('12 séries planejadas');

    await user.click(screen.getByRole('button', { name: 'Mover agachamento para baixo' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'agachamento movido para a posição 2 de 4',
      ),
    );
  });
});

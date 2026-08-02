import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SessionSet, WorkoutPlanExercise } from '@fatia/api-client';
import { ExerciseDetailCard } from '../exercise-detail-card';

/**
 * O card tem teste próprio porque a devolução do foco (#221) é comportamento
 * dele, e ele é o mesmo componente da tela de sessão — onde não há seta
 * nenhuma. Um teste que só olhasse a tela de plano deixaria a sessão sem rede
 * de proteção.
 */

// Mesmo motivo do teste da tela de plano: o `vaul` não monta no jsdom.
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
      getPersonalRecord: vi.fn(),
      getExercise: vi.fn(),
      updateSessionSet: vi.fn(),
      deleteSessionSet: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

function planExercise(id: string, name: string, order: number): WorkoutPlanExercise {
  return {
    id,
    planId: 'plan-1',
    exerciseId: order,
    order,
    targetSets: 3,
    targetReps: '8-12',
    exercise: {
      id: order,
      name,
      muscleGroup: 'peito',
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
    },
  };
}

/**
 * Encerra a troca "em voo" da lista de teste sem clicar em nada: um clique
 * moveria o foco por si só e apagaria justamente o que está sendo medido.
 */
type RegistrarConclusao = (concluir: () => void) => void;

/**
 * Réplica mínima do que a tela de plano faz em volta do card: a lista se
 * reordena no toque (otimismo da #115) e as duas setas ficam travadas até a
 * resposta. É esse par — nó do DOM mudando de lugar e botão sob o foco virando
 * `disabled` — que joga o foco para o `<body>`.
 */
function Lista({ nomes, onRegistrar }: { nomes: string[]; onRegistrar: RegistrarConclusao }) {
  const [ordem, setOrdem] = useState(() => nomes.map((n, i) => planExercise(`pe-${i}`, n, i + 1)));
  const [movendo, setMovendo] = useState(false);

  useEffect(() => {
    onRegistrar(() => setMovendo(false));
  }, [onRegistrar]);

  function mover(index: number, delta: -1 | 1) {
    if (movendo) return;
    const alvo = index + delta;
    if (alvo < 0 || alvo >= ordem.length) return;
    setMovendo(true);
    setOrdem((atual) => {
      const proxima = [...atual];
      [proxima[index], proxima[alvo]] = [proxima[alvo], proxima[index]];
      return proxima;
    });
  }

  return (
    <div>
      {ordem.map((item, index) => (
        <ExerciseDetailCard
          key={item.id}
          mode="plan"
          item={item}
          isFirst={index === 0}
          isLast={index === ordem.length - 1}
          isMoving={movendo}
          onMoveUp={() => mover(index, -1)}
          onMoveDown={() => mover(index, 1)}
          onRemove={() => {}}
        />
      ))}
    </div>
  );
}

function renderLista(nomes: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getPersonalRecord.mockResolvedValue(null);
  const user = userEvent.setup();
  let concluir: () => void = () => {};
  const onRegistrar: RegistrarConclusao = (fn) => {
    concluir = fn;
  };
  render(
    <QueryClientProvider client={client}>
      <Lista nomes={nomes} onRegistrar={onRegistrar} />
    </QueryClientProvider>,
  );
  return { user, concluirMovimento: () => act(() => concluir()) };
}

function nomesNaOrdem(): string[] {
  return screen
    .getAllByRole('button', { name: /^Ver detalhes de / })
    .map((b) => (b.getAttribute('aria-label') ?? '').replace('Ver detalhes de ', ''));
}

describe('ExerciseDetailCard — foco ao reordenar', () => {
  it('devolve o foco à mesma seta depois do movimento', async () => {
    const { user, concluirMovimento } = renderLista(['Supino', 'Crucifixo', 'Crossover', 'Rosca']);

    const descer = screen.getByRole('button', { name: /mover crucifixo para baixo/i });
    await user.click(descer);

    // O card já trocou de lugar e a seta está travada: neste instante o foco
    // está no `<body>`, que é o defeito. O que se cobra é o depois.
    await waitFor(() =>
      expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo', 'Rosca']),
    );

    concluirMovimento();

    // Sem o conserto, quem navega por teclado volta para o começo do documento
    // a cada movimento e precisa tabular a lista inteira de novo.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toHaveFocus(),
    );
  });

  it('cai na seta irmã quando o exercício para na borda da lista', async () => {
    const { user, concluirMovimento } = renderLista(['Supino', 'Crucifixo', 'Crossover']);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));

    concluirMovimento();

    // Crucifixo virou o último: a seta que ele usou fica desabilitada para
    // sempre. Insistir nela deixaria o foco no `<body>` do mesmo jeito.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para cima/i })).toHaveFocus(),
    );
  });

  it('não rouba o foco de quem saiu do card durante o movimento', async () => {
    const { user, concluirMovimento } = renderLista(['Supino', 'Crucifixo', 'Crossover', 'Rosca']);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    await waitFor(() =>
      expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo', 'Rosca']),
    );

    // Durante o voo a pessoa foi para outro controle — a lixeira, que não é
    // travada por `isMoving`. Devolver o foco aqui seria trocar um defeito por
    // outro pior: o cursor pulando sozinho.
    const outro = screen.getByRole('button', { name: /remover supino do plano/i });
    act(() => outro.focus());

    concluirMovimento();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toBeEnabled(),
    );
    expect(outro).toHaveFocus();
  });

  it('só o card que pediu o movimento devolve o foco', async () => {
    const { user, concluirMovimento } = renderLista(['Supino', 'Crucifixo', 'Crossover', 'Rosca']);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    concluirMovimento();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toHaveFocus(),
    );

    // Segundo movimento, outro card. Se cada card devolvesse o foco a cada
    // destravada, quatro cards brigariam pelo cursor no mesmo instante.
    await user.click(screen.getByRole('button', { name: /mover supino para baixo/i }));
    concluirMovimento();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover supino para baixo/i })).toHaveFocus(),
    );
  });
});

describe('ExerciseDetailCard — modo sessão', () => {
  function loggedSet(id: string): SessionSet {
    return {
      id,
      sessionId: 'sess-1',
      exerciseId: 1,
      setNumber: 1,
      weightKg: 40,
      reps: 10,
      rpe: null,
      durationSeconds: null,
      distanceMeters: null,
      avgHeartRate: null,
      kcalBurned: null,
      notes: null,
      exercise: planExercise('pe-0', 'Supino', 1).exercise,
    };
  }

  it('não tem setas nem mexe no foco', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getPersonalRecord.mockResolvedValue(null);
    render(
      <QueryClientProvider client={client}>
        <button type="button">Fora do card</button>
        <ExerciseDetailCard
          mode="readonly"
          item={planExercise('pe-0', 'Supino', 1)}
          loggedSets={[loggedSet('set-1')]}
        />
      </QueryClientProvider>,
    );

    const fora = screen.getByRole('button', { name: 'Fora do card' });
    act(() => fora.focus());

    expect(screen.queryByRole('button', { name: /mover supino/i })).toBeNull();
    // A tela de sessão não reordena nada; o card não pode arrastar o foco para
    // dentro dele só por ter ganhado um `useEffect`.
    await waitFor(() => expect(screen.getByText('Supino')).toBeVisible());
    expect(fora).toHaveFocus();
  });
});

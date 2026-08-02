import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError, type WorkoutPlan, type WorkoutPlanExercise } from '@fatia/api-client';
import PlanDetailPage from '../page';

/**
 * A regressão que a #183 existe para evitar mora aqui, na tela — não no
 * api-client. Reordenar por dois PATCH voltaria a passar num teste de unidade
 * do cliente HTTP; o que pega é contar requisições a partir do clique.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'plan-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mesmo motivo do teste do FoodSearchDrawer: o `vaul` não monta no jsdom.
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
      getPlan: vi.fn(),
      updatePlan: vi.fn(),
      deletePlan: vi.fn(),
      updatePlanExercise: vi.fn(),
      removePlanExercise: vi.fn(),
      reorderPlanExercises: vi.fn(),
      startSession: vi.fn(),
      getPersonalRecord: vi.fn(),
      getExercise: vi.fn(),
      searchExercises: vi.fn(),
      addPlanExercise: vi.fn(),
    },
  };
});

import { workoutApi } from '@fatia/api-client';

const getPlan = vi.mocked(workoutApi.getPlan);
const reorderPlanExercises = vi.mocked(workoutApi.reorderPlanExercises);
const removePlanExercise = vi.mocked(workoutApi.removePlanExercise);
const getPersonalRecord = vi.mocked(workoutApi.getPersonalRecord);

/** Promessa controlada pelo teste — segura a mutation "em voo". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
 * `order` com buracos (1, 5, 9) de propósito: `addPlanExercise` usa `max + 1` e
 * remover não renumera, então plano real tem buraco. Se alguém trocar o `order`
 * do vizinho por `index`, estes testes quebram.
 */
function plan(
  exercises = [
    planExercise('pe-a', 'Supino', 1),
    planExercise('pe-b', 'Crucifixo', 5),
    planExercise('pe-c', 'Crossover', 9),
  ],
): WorkoutPlan {
  return { id: 'plan-1', userId: 'user-1', name: 'Peito', exercises };
}

/** O client da renderização corrente — só o teste do `cancelQueries` precisa. */
let queryClient: QueryClient;

function renderPage() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanDetailPage />
    </QueryClientProvider>,
  );
}

async function renderLoadedPage() {
  getPersonalRecord.mockResolvedValue(null);
  getPlan.mockResolvedValue(plan());
  const user = userEvent.setup();
  renderPage();
  await screen.findByRole('button', { name: /mover crucifixo para baixo/i });
  return user;
}

/**
 * Nomes na ordem em que os cards aparecem no DOM.
 *
 * Ler o `order` do cache provaria menos: o que quebra na mão do usuário é o
 * card não sair do lugar. `getAllByRole` devolve na ordem do documento, e cada
 * card tem exatamente um botão "Ver detalhes de <nome>".
 */
function nomesNaOrdem(): string[] {
  return screen
    .getAllByRole('button', { name: /^Ver detalhes de / })
    .map((b) => (b.getAttribute('aria-label') ?? '').replace('Ver detalhes de ', ''));
}

/** Plano com Crucifixo e Crossover já trocados — o que a API devolveria. */
function planoTrocado(): WorkoutPlan {
  return plan([
    planExercise('pe-a', 'Supino', 1),
    planExercise('pe-c', 'Crossover', 5),
    planExercise('pe-b', 'Crucifixo', 9),
  ]);
}

/**
 * O mesmo movimento, mas com o Supino já removido em outro lugar. `pe-b` e
 * `pe-c` continuam pertencendo ao plano, então a regra da #205 não dispara o
 * 404: a API aceita a troca e devolve dois exercícios.
 */
function planoTrocadoSemSupino(): WorkoutPlan {
  return plan([planExercise('pe-c', 'Crossover', 5), planExercise('pe-b', 'Crucifixo', 9)]);
}

describe('PlanDetailPage — reordenação', () => {
  it('reordena com uma requisição só, mandando o `order` do vizinho', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockResolvedValue(plan());

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    await waitFor(() => expect(reorderPlanExercises).toHaveBeenCalledTimes(1));
    expect(reorderPlanExercises).toHaveBeenCalledWith('plan-1', [
      { id: 'pe-b', order: 9 },
      { id: 'pe-c', order: 5 },
    ]);
  });

  it('recusa o segundo clique enquanto a primeira troca não respondeu', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);

    const down = screen.getByRole('button', { name: /mover crucifixo para baixo/i });
    await user.click(down);
    await waitFor(() => expect(down).toBeDisabled());

    // Segundo clique sobre o mesmo snapshot. Sem a trava ele gravaria uma troca
    // sobreposta e deixaria dois exercícios com o mesmo `order`.
    await user.click(down);
    await user.click(screen.getByRole('button', { name: /mover supino para baixo/i }));

    expect(reorderPlanExercises).toHaveBeenCalledTimes(1);

    pending.resolve(plan());
    await waitFor(() => expect(down).toBeEnabled());
  });

  it('mostra a ordem que a resposta traz, sem refazer a busca do plano', async () => {
    const user = await renderLoadedPage();
    expect(getPlan).toHaveBeenCalledTimes(1);
    // A resposta diverge do palpite otimista de propósito. Devolvendo a mesma
    // ordem que o `onMutate` já escreveu, este teste passaria mesmo sem o
    // `setQueryData(updated)` do `onSuccess` — o DOM que ele observa viria do
    // palpite, e não da resposta que ele diz estar medindo.
    reorderPlanExercises.mockResolvedValue(
      plan([
        planExercise('pe-c', 'Crossover', 1),
        planExercise('pe-a', 'Supino', 5),
        planExercise('pe-b', 'Crucifixo', 9),
      ]),
    );

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Crossover', 'Supino', 'Crucifixo']));
    expect(getPlan).toHaveBeenCalledTimes(1);
  });

  it('descarta o refetch que já estava em voo quando o card se move', async () => {
    const user = await renderLoadedPage();
    const emVoo = deferred<WorkoutPlan>();
    getPlan.mockReturnValueOnce(emVoo.promise);
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);

    // Refetch disparado antes do toque, ainda sem resposta.
    const refetch = queryClient.refetchQueries({ queryKey: ['workout', 'plan', 'plan-1'] });
    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));

    // A resposta atrasada traz a ordem antiga. Sem o `cancelQueries` do
    // `onMutate` ela é escrita no cache depois do palpite e o card pula de
    // volta sozinho, sem erro em lugar nenhum.
    // Esperar o próprio refetch fecha a janela sem `sleep`: quando ele termina,
    // ou o dado já foi escrito no cache, ou foi descartado pelo cancelamento.
    await act(async () => {
      emVoo.resolve(plan());
      await refetch;
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']);
  });

  it('traduz o 404 de id obsoleto e busca a lista de novo', async () => {
    const user = await renderLoadedPage();
    // Desde a #205 a API recusa a operação inteira quando algum id do corpo não
    // pertence mais ao plano — exercício removido em outra aba, cache velho
    // aqui. A mensagem crua seria "Plan exercise not found".
    reorderPlanExercises.mockRejectedValue(new ApiError('Plan exercise not found', 404));

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/este plano mudou em outro lugar/i);
    expect(alert).not.toHaveTextContent(/plan exercise not found/i);
    // O cache velho é a causa: sem refetch a pessoa clicaria de novo no mesmo erro.
    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
  });

  it('avisa quando a API recusa o movimento, e a lista continua como estava', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockRejectedValue(new Error('Plan not found'));

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível mover o exercício/i);
    expect(alert).toHaveTextContent(/plan not found/i);
    // Crucifixo continua no meio — o botão "para baixo" segue disponível.
    expect(screen.getByRole('button', { name: /mover crucifixo para baixo/i })).toBeEnabled();
  });

  it('reposiciona o card antes da resposta da API', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);
    expect(nomesNaOrdem()).toEqual(['Supino', 'Crucifixo', 'Crossover']);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    // Ainda em voo: sem otimismo a lista só mudaria depois do `resolve`.
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));
    expect(reorderPlanExercises).toHaveBeenCalledTimes(1);

    pending.resolve(planoTrocado());
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));
  });

  it('desfaz o reposicionamento quando a API recusa', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));

    pending.reject(new Error('Network error'));

    // Sem rollback a lista ficaria numa ordem que o servidor não tem, e o
    // próximo movimento partiria dela.
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crucifixo', 'Crossover']));
    await screen.findByRole('alert');
  });

  it('anuncia a nova posição só depois do sucesso, nunca no clique', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);

    // A região viva já existe antes de qualquer movimento: montada junto com o
    // texto, a primeira troca de todas não seria anunciada.
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    // O card já se moveu — o anúncio, não. Falar aqui afirmaria um movimento
    // que a rede ainda pode recusar.
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));
    expect(status.textContent).toBe('');

    pending.resolve(planoTrocado());

    await waitFor(() => expect(status.textContent).toBe('Crucifixo movido para a posição 3 de 3'));
  });

  it('anuncia a posição que a resposta traz, não a que estava na tela no toque', async () => {
    const user = await renderLoadedPage();
    // Outro aparelho removeu o Supino durante a sessão desta tela.
    reorderPlanExercises.mockResolvedValue(planoTrocadoSemSupino());

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    // Contando pelo snapshot do clique sairia "posição 3 de 3" — os dois
    // números errados, justamente para quem só tem a região viva.
    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Crucifixo movido para a posição 2 de 2'));
    expect(nomesNaOrdem()).toEqual(['Crossover', 'Crucifixo']);
  });

  it('não ressuscita, no rollback, o exercício apagado durante o voo', async () => {
    const user = await renderLoadedPage();
    const pending = deferred<WorkoutPlan>();
    reorderPlanExercises.mockReturnValue(pending.promise);
    removePlanExercise.mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));

    // A lixeira do card não é travada por `isMoving` — só as setas são.
    getPlan.mockResolvedValue(
      plan([planExercise('pe-b', 'Crucifixo', 5), planExercise('pe-c', 'Crossover', 9)]),
    );
    await user.click(screen.getByRole('button', { name: /remover supino do plano/i }));
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Crucifixo', 'Crossover']));

    pending.reject(new Error('Network error'));
    await screen.findByRole('alert');

    // O snapshot do `onMutate` ainda tem o Supino. Restaurá-lo sem confirmar
    // com o servidor devolveria à tela um exercício já apagado, e o usuário
    // veria o próprio delete se desfazer sozinho.
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Crucifixo', 'Crossover']));
  });

  it('não deixa no ar o anúncio de um movimento que foi desfeito', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockResolvedValue(planoTrocado());

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));
    const status = screen.getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Crucifixo movido para a posição 3 de 3'));

    reorderPlanExercises.mockRejectedValue(new Error('Network error'));
    await user.click(screen.getByRole('button', { name: /mover crossover para cima/i }));

    await screen.findByRole('alert');
    expect(status.textContent).toBe('');
  });

  it('devolve o foco ao card movido, e não ao começo do documento', async () => {
    const user = await renderLoadedPage();
    reorderPlanExercises.mockResolvedValue(planoTrocado());

    await user.click(screen.getByRole('button', { name: /mover crucifixo para baixo/i }));

    // O comportamento é do card (#221), mas quem o dispara é esta tela: é o
    // `isPending` da mutation que desabilita a seta sob o foco. Crucifixo virou
    // o último, então a seta que ele usou fica desabilitada e o foco cai na
    // irmã — no mesmo card, e não no `<body>`.
    await waitFor(() => expect(nomesNaOrdem()).toEqual(['Supino', 'Crossover', 'Crucifixo']));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mover crucifixo para cima/i })).toHaveFocus(),
    );
  });

  it('mantém as bordas travadas: o primeiro não sobe e o último não desce', async () => {
    await renderLoadedPage();

    expect(screen.getByRole('button', { name: /mover supino para cima/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mover crossover para baixo/i })).toBeDisabled();
    expect(reorderPlanExercises).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ShareScope, Student, StudentReadResult } from '@fatia/api-client';
import StudentPage from '../page';

/**
 * O contrato cliente↔API do painel, confrontado com o payload que a API **de
 * fato** devolve.
 *
 * Os tipos de `packages/api-client/src/sharing.ts` foram escritos à mão, e o
 * `tsc` acredita neles: uma declaração de resposta errada não tem com o que
 * conflitar, então `typecheck` fica verde sobre um payload que não existe. Foi
 * assim que `history.days` (número) virou array no cliente, `ponto.value`
 * nasceu sem existir e `session.finishedAt` ficou com nome de campo que o
 * schema não tem.
 *
 * O que fecha esse buraco é a combinação de duas coisas neste arquivo:
 *
 * 1. as fixtures abaixo são o payload **real**, copiado da forma de retorno dos
 *    services de domínio, e estão anotadas com `StudentReadResult` — o tipo do
 *    cliente. Uma divergência de forma vira erro de `tsc` aqui, na hora;
 * 2. a página é renderizada com elas, e as asserções cobram o **valor**, não a
 *    presença de linha. `undefined` renderiza tão bem quanto `9000`.
 *
 * Uma fixture só, ou uma asserção que só contasse linhas, deixaria passar
 * exatamente os defeitos que este arquivo existe para prender.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ membershipId: 'mem-a' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    professionalApi: { listStudents: vi.fn(), readStudent: vi.fn() },
  };
});

import { professionalApi } from '@fatia/api-client';

const listStudents = vi.mocked(professionalApi.listStudents);
const readStudent = vi.mocked(professionalApi.readStudent);

function aluno(scopes: ShareScope[]): Student {
  return {
    membershipId: 'mem-a',
    name: 'Ana',
    groupId: 'grp-1',
    groupName: 'Academia',
    joinedAt: '2026-01-10T00:00:00.000Z',
    scopesGrantedToMe: scopes,
  };
}

function envelope(reading: StudentReadResult['reading']): StudentReadResult {
  return { membershipId: 'mem-a', timezone: 'America/Sao_Paulo', reading };
}

/**
 * `NutritionSummaryService.getHistory` devolve `{ days, series, averages }`, com
 * `days` sendo **a janela** — o array chama-se `series`.
 */
const NUTRITION = envelope({
  scope: 'NUTRITION',
  history: {
    days: 7,
    series: [
      { date: '2026-07-28', meals: 3, kcal: 2140.5, proteinG: 130, carbsG: 210, fatG: 70 },
      { date: '2026-07-29', meals: 2, kcal: 1780.2, proteinG: 110, carbsG: 180, fatG: 60 },
    ],
    averages: { kcal: 560.1, proteinG: 34.29, carbsG: 55.71, fatG: 18.57 },
  },
});

/**
 * `stepsProgress` e `waterProgress` devolvem pontos com nomes **diferentes** —
 * `steps` de um lado, `totalMl` do outro. Não existe um `value` genérico.
 */
const HABITS = envelope({
  scope: 'HABITS',
  steps: {
    points: [{ date: '2026-08-01', steps: 9000, goalReached: true }],
    weeklyAverages: [{ weekStart: '2026-07-27', avgSteps: 9000 }],
    totalSteps: 9000,
    averageDaily: 9000,
    bestDay: { date: '2026-08-01', steps: 9000 },
    goalTarget: 8000,
    daysWithGoalReached: 1,
  },
  water: {
    points: [{ date: '2026-08-01', totalMl: 1500, goalReached: false }],
    totalMl: 1500,
    averageDailyMl: 1500,
    bestDay: { date: '2026-08-01', totalMl: 1500 },
    goalTargetMl: 2000,
    daysWithGoalReached: 0,
  },
});

/**
 * `WorkoutSession` fecha em `completedAt` — o schema não tem `finishedAt`. As
 * duas sessões existem para que a asserção distinga: uma fechada e uma aberta.
 * Com uma só, "em andamento" em todas passaria pela metade dos casos.
 *
 * `volumeProgress` devolve `{ weeks, averageWeeklyVolumeKg }`, e cada semana tem
 * `totalVolumeKg`. Ninguém renderiza volume hoje; ele está aqui porque é o `tsc`
 * desta fixture que segura o tipo.
 */
const WORKOUT = envelope({
  scope: 'WORKOUT',
  plans: [
    {
      id: 'plan-1',
      name: 'Push',
      createdAt: '2026-07-01T10:00:00.000Z',
      exercises: [
        {
          id: 'pe-1',
          order: 1,
          targetSets: 4,
          targetReps: '8-12',
          exercise: { id: 3, name: 'Supino', muscleGroup: 'peito' },
        },
      ],
    },
  ],
  sessions: [
    {
      id: 'ses-1',
      startedAt: '2026-08-01T09:00:00.000Z',
      completedAt: '2026-08-01T10:05:00.000Z',
      notes: null,
    },
    {
      id: 'ses-2',
      startedAt: '2026-08-02T09:00:00.000Z',
      completedAt: null,
      notes: null,
    },
  ],
  volume: {
    weeks: [{ weekStart: '2026-07-27', totalVolumeKg: 12000, sessionCount: 3 }],
    averageWeeklyVolumeKg: 12000,
  },
});

const BODY = envelope({
  scope: 'BODY',
  weight: {
    points: [{ date: '2026-08-01', weightKg: 72.4 }],
    weeklyAverages: [{ weekStart: '2026-07-27', avgKg: 72.4, deltaKg: null }],
    totalDeltaKg: 0,
    currentWeightKg: 72.4,
  },
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentPage />
    </QueryClientProvider>,
  );
}

describe('painel do profissional — a tela contra o payload real (#157)', () => {
  it('nutrição: lista os dias de history.series, e não estoura na janela', async () => {
    // O caso central da issue para o nutricionista: a aluna consentiu só
    // NUTRITION, então é a categoria que abre sozinha. Com `history.days` lido
    // como array, `(7).map` derruba a página inteira — não há `error.tsx` em
    // `apps/web/src/app` para absorver.
    listStudents.mockResolvedValue([aluno(['NUTRITION'])]);
    readStudent.mockResolvedValue(NUTRITION);

    renderPage();

    expect(await screen.findByText('2026-07-28')).toBeTruthy();
    expect(screen.getByText('2141 kcal')).toBeTruthy();
    expect(screen.getByText('1780 kcal')).toBeTruthy();
  });

  it('hábitos: passos e água saem com o número, não com "undefined"', async () => {
    // `String(undefined)` renderiza igualzinho a um número — a linha aparece, a
    // contagem bate, e só o valor denuncia. Por isso a asserção é pelo texto
    // exato do valor, e não pela quantidade de linhas.
    listStudents.mockResolvedValue([aluno(['HABITS'])]);
    readStudent.mockResolvedValue(HABITS);

    renderPage();

    expect(await screen.findByText('9000')).toBeTruthy();
    expect(screen.getByText('1500 ml')).toBeTruthy();
    expect(screen.queryByText('undefined')).toBeNull();
    expect(screen.queryByText('undefined ml')).toBeNull();
  });

  it('treino: sessão fechada aparece como concluída, e a aberta não', async () => {
    // `finishedAt` não existe no schema: era sempre `undefined`, e toda sessão
    // — inclusive as fechadas — saía como "em andamento". Não quebra a tela,
    // só mente sobre o treino do aluno.
    listStudents.mockResolvedValue([aluno(['WORKOUT'])]);
    readStudent.mockResolvedValue(WORKOUT);

    renderPage();

    expect(await screen.findByText('concluído')).toBeTruthy();
    expect(screen.getByText('em andamento')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
  });

  it('peso: a série do corpo continua saindo com o valor', async () => {
    listStudents.mockResolvedValue([aluno(['BODY'])]);
    readStudent.mockResolvedValue(BODY);

    renderPage();

    expect(await screen.findByText('72.4 kg')).toBeTruthy();
  });

  it('trocar de categoria pede a leitura da categoria clicada', async () => {
    // A aba é o que dispara uma linha nova na trilha do aluno. Se o clique
    // pedisse a categoria errada, ele leria uma leitura que o profissional não
    // fez — e ele estaria certo em estranhar.
    listStudents.mockResolvedValue([aluno(['WORKOUT', 'HABITS'])]);
    readStudent.mockImplementation((_id, scope) =>
      Promise.resolve(scope === 'HABITS' ? HABITS : WORKOUT),
    );

    renderPage();
    expect(await screen.findByText('Push')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Água e passos' }));

    await waitFor(() => expect(screen.getByText('9000')).toBeTruthy());
    expect(readStudent).toHaveBeenCalledWith('mem-a', 'HABITS');
  });

  it('sem categoria autorizada não dispara leitura nenhuma', async () => {
    listStudents.mockResolvedValue([aluno([])]);

    renderPage();

    expect(await screen.findByText('Nada autorizado')).toBeTruthy();
    expect(readStudent).not.toHaveBeenCalled();
  });
});

import { canonicalGroupsOf } from '../helpers/muscle-group';
import {
  summarizeTrainingWeek,
  summarizeWeeklyMuscles,
  WEEKLY_SETS_TARGET,
} from '../muscle-summary.service';

/**
 * O que os cards da aba Treino (#369) e a semana da #377 leem: séries por grupo
 * nos últimos 7 dias, os grupos descansados e um plano que os trabalha.
 */
const TZ = 'America/Sao_Paulo';
// 2026-11-14, 15h em São Paulo.
const NOW = new Date('2026-11-14T18:00:00Z');

const ex = (id: number, primaryMuscles: string[], muscleGroup = 'peito') => ({
  id,
  muscleGroup,
  primaryMuscles,
});

const BENCH = ex(1, ['chest', 'triceps']);
const SQUAT = ex(2, ['quadriceps', 'glutes'], 'pernas');
const ROW = ex(3, ['middle back', 'lats'], 'costas');
const RUN = ex(4, ['quadriceps'], 'cardio');
const NO_MUSCLES = ex(5, [], 'peito');

const set = (exercise: ReturnType<typeof ex>, startedAt: string) => ({
  exercise,
  session: { startedAt: new Date(startedAt) },
});

describe('canonicalGroupsOf', () => {
  it('leva os músculos anatômicos aos grupos do catálogo, sem repetir', () => {
    expect(canonicalGroupsOf(['chest', 'triceps', 'biceps'])).toEqual(['peito', 'braço']);
    expect(canonicalGroupsOf(['quadriceps', 'glutes', 'calves'])).toEqual(['pernas']);
    expect(canonicalGroupsOf(['lats', 'middle back', 'traps'])).toEqual(['costas']);
    expect(canonicalGroupsOf(['abdominals'])).toEqual(['core']);
    expect(canonicalGroupsOf(['shoulders'])).toEqual(['ombro']);
  });

  it('ignora o que não é músculo do diagrama', () => {
    expect(canonicalGroupsOf(['qualquer coisa'])).toEqual([]);
  });
});

describe('summarizeWeeklyMuscles', () => {
  it('conta as séries por grupo dos últimos 7 dias, com a meta 12', () => {
    const summary = summarizeWeeklyMuscles({
      sets: [
        set(BENCH, '2026-11-13T12:00:00Z'),
        set(BENCH, '2026-11-13T12:05:00Z'),
        set(SQUAT, '2026-11-10T12:00:00Z'),
      ],
      plans: [],
      now: NOW,
      timezone: TZ,
    });

    expect(summary.target).toBe(WEEKLY_SETS_TARGET);
    expect(WEEKLY_SETS_TARGET).toBe(12);
    const sets = Object.fromEntries(summary.sets.map((s) => [s.group, s.sets]));
    // Supino conta no peito e no braço (tríceps): cada grupo primário uma vez.
    expect(sets).toMatchObject({ peito: 2, braço: 2, pernas: 1, costas: 0, ombro: 0, core: 0 });
    expect(summary.sets.map((s) => s.group)).not.toContain('cardio');
  });

  it('cardio e exercício sem músculo primário ficam fora das séries de força', () => {
    const summary = summarizeWeeklyMuscles({
      sets: [set(RUN, '2026-11-13T12:00:00Z'), set(NO_MUSCLES, '2026-11-13T12:00:00Z')],
      plans: [],
      now: NOW,
      timezone: TZ,
    });
    expect(summary.sets.every((s) => s.sets === 0)).toBe(true);
  });

  it('a semana segue o fuso da pessoa: 23h de domingo em SP é domingo, não segunda', () => {
    // 2026-11-08 23h em São Paulo = 2026-11-09 02h UTC. Sete dias até 14/11
    // começam em 08/11, então entra; um dia antes (07/11 23h) não.
    const summary = summarizeWeeklyMuscles({
      sets: [set(ROW, '2026-11-09T02:00:00Z'), set(ROW, '2026-11-08T02:00:00Z')],
      plans: [],
      now: NOW,
      timezone: TZ,
    });
    expect(summary.sets.find((s) => s.group === 'costas')?.sets).toBe(1);
  });

  it('descansado é o grupo sem série há 2 dias ou mais, com "há N dias"', () => {
    const summary = summarizeWeeklyMuscles({
      sets: [
        set(BENCH, '2026-11-14T12:00:00Z'), // hoje
        set(SQUAT, '2026-11-11T12:00:00Z'), // há 3 dias
        set(ROW, '2026-11-01T12:00:00Z'), // há 13 dias, fora da semana
      ],
      plans: [],
      now: NOW,
      timezone: TZ,
    });

    const rested = Object.fromEntries(summary.rested.map((r) => [r.group, r.daysSince]));
    expect(rested).toMatchObject({ pernas: 3, costas: 13, ombro: null, core: null });
    expect(rested).not.toHaveProperty('peito');
    expect(rested).not.toHaveProperty('braço');
    // Mais descansado primeiro; nunca treinado vem por último.
    expect(summary.rested[0]!.group).toBe('costas');
  });

  it('sugere o plano da pessoa que mais trabalha os grupos descansados', () => {
    const summary = summarizeWeeklyMuscles({
      sets: [set(BENCH, '2026-11-14T12:00:00Z')],
      plans: [
        { id: 'push', name: 'Push', exercises: [{ exercise: BENCH }] },
        {
          id: 'legs',
          name: 'Pernas e costas',
          exercises: [{ exercise: SQUAT }, { exercise: ROW }],
        },
      ],
      now: NOW,
      timezone: TZ,
    });
    expect(summary.suggestedPlan).toEqual({
      id: 'legs',
      name: 'Pernas e costas',
      groups: ['pernas', 'costas'],
    });
  });

  it('sem plano que trabalhe os descansados, não sugere nada', () => {
    const summary = summarizeWeeklyMuscles({
      sets: [set(BENCH, '2026-11-14T12:00:00Z')],
      plans: [{ id: 'push', name: 'Push', exercises: [{ exercise: BENCH }] }],
      now: NOW,
      timezone: TZ,
    });
    expect(summary.suggestedPlan).toBeNull();
  });
});

describe('summarizeTrainingWeek (#377)', () => {
  const sess = (startedAt: string, completedAt: string | null) => ({
    startedAt: new Date(startedAt),
    completedAt: completedAt ? new Date(completedAt) : null,
  });

  it('segunda a domingo no fuso da pessoa, com os dias treinados e o total contra a meta', () => {
    // NOW = sábado 14/11 15h em São Paulo; a semana começa na segunda 09/11.
    const week = summarizeTrainingWeek({
      sessions: [
        sess('2026-11-09T22:00:00Z', '2026-11-09T23:00:00Z'),
        sess('2026-11-11T12:00:00Z', '2026-11-11T13:00:00Z'),
        sess('2026-11-11T20:00:00Z', '2026-11-11T21:00:00Z'),
        // Domingo 08/11 às 23h em SP já é segunda em UTC: é da semana passada.
        sess('2026-11-09T02:00:00Z', '2026-11-09T03:00:00Z'),
        sess('2026-11-14T17:00:00Z', null),
      ],
      now: NOW,
      timezone: TZ,
      target: 4,
    });
    expect(week.start).toBe('2026-11-09');
    expect(week.days.map((d) => d.date)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(week.days.map((d) => d.trained)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(week.days.map((d) => d.active)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(week.days.map((d) => d.today)).toEqual([false, false, false, false, false, true, false]);
    // Dois treinos no mesmo dia contam dois; o aberto ainda não conta.
    expect(week.done).toBe(3);
    expect(week.target).toBe(4);
  });

  it('outra semana (#479): a do dia pedido, sem "hoje", com os treinos dela', () => {
    // Quarta 04/11: a semana de 02/11 a 08/11, a anterior à de NOW.
    const week = summarizeTrainingWeek({
      sessions: [
        sess('2026-11-02T12:00:00Z', '2026-11-02T13:00:00Z'),
        // Domingo 08/11 às 23h em SP: ainda desta semana.
        sess('2026-11-09T02:00:00Z', '2026-11-09T03:00:00Z'),
        // A semana de NOW fica de fora.
        sess('2026-11-11T12:00:00Z', '2026-11-11T13:00:00Z'),
      ],
      now: NOW,
      timezone: TZ,
      target: 4,
      weekOf: '2026-11-04',
    });
    expect(week.start).toBe('2026-11-02');
    expect(week.days.map((d) => d.date)[6]).toBe('2026-11-08');
    expect(week.days.map((d) => d.trained)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(week.days.some((d) => d.today)).toBe(false);
    expect(week.done).toBe(2);
  });

  it('sem meta, o alvo é nulo e a semana tem os 7 dias', () => {
    const week = summarizeTrainingWeek({ sessions: [], now: NOW, timezone: TZ, target: null });
    expect(week).toMatchObject({ done: 0, target: null });
    expect(week.days).toHaveLength(7);
  });
});

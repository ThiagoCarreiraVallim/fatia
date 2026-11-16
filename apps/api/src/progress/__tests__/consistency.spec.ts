import { addDaysIso } from '../helpers/date-tz';
import {
  areaSummary,
  buildDayAreas,
  consistencyWindow,
  longestStreak,
  type DaySources,
} from '../helpers/consistency';

/**
 * Constância (#382, prancha Al-G12): o dia vale pelas áreas cumpridas, de 0 a 4. É a mesma
 * regra que a sequência usa — um dia é ativo com uma área ou mais —, então estes casos são a
 * definição de "dia ativo" para o app inteiro.
 */

const HOJE = '2026-11-16';

function fontes(parcial: Partial<DaySources> = {}): DaySources {
  return {
    mealDays: new Set(),
    workoutDays: new Set(),
    waterMlByDay: new Map(),
    stepsByDay: new Map(),
    waterTargetMl: 2000,
    stepsTarget: 8000,
    ...parcial,
  };
}

describe('buildDayAreas', () => {
  it('um dia por data, do início ao fim, inclusive', () => {
    const dias = buildDayAreas(addDaysIso(HOJE, -2), HOJE, fontes());

    expect(dias.map((d) => d.date)).toEqual([addDaysIso(HOJE, -2), addDaysIso(HOJE, -1), HOJE]);
    expect(dias.every((d) => d.count === 0)).toBe(true);
  });

  it('conta as quatro áreas: refeição, treino, água na meta e passos na meta', () => {
    const [dia] = buildDayAreas(
      HOJE,
      HOJE,
      fontes({
        mealDays: new Set([HOJE]),
        workoutDays: new Set([HOJE]),
        waterMlByDay: new Map([[HOJE, 2000]]),
        stepsByDay: new Map([[HOJE, 8000]]),
      }),
    );

    expect(dia).toEqual({
      date: HOJE,
      meal: true,
      workout: true,
      water: true,
      steps: true,
      count: 4,
    });
  });

  it('água e passos abaixo da meta não contam', () => {
    const [dia] = buildDayAreas(
      HOJE,
      HOJE,
      fontes({ waterMlByDay: new Map([[HOJE, 1999]]), stepsByDay: new Map([[HOJE, 7999]]) }),
    );

    expect(dia.count).toBe(0);
  });

  it('sem meta de água ou de passos, essas áreas nunca contam', () => {
    // Sem linha de UserGoals não há meta declarada, e sem meta não há o que bater: 30 mil passos
    // não inventam um dia na meta.
    const [dia] = buildDayAreas(
      HOJE,
      HOJE,
      fontes({
        waterTargetMl: null,
        stepsTarget: null,
        waterMlByDay: new Map([[HOJE, 5000]]),
        stepsByDay: new Map([[HOJE, 30_000]]),
      }),
    );

    expect(dia.count).toBe(0);
  });

  it('só a água na meta já faz o dia ativo (dado novo da #382)', () => {
    const [dia] = buildDayAreas(HOJE, HOJE, fontes({ waterMlByDay: new Map([[HOJE, 2500]]) }));

    expect(dia.water).toBe(true);
    expect(dia.count).toBe(1);
  });
});

describe('consistencyWindow', () => {
  it('mês = 30 dias, trimestre = 90, ano = 365, todos terminando hoje', () => {
    expect(consistencyWindow('month', HOJE)).toEqual({ from: addDaysIso(HOJE, -29), to: HOJE });
    expect(consistencyWindow('quarter', HOJE)).toEqual({ from: addDaysIso(HOJE, -89), to: HOJE });
    expect(consistencyWindow('year', HOJE)).toEqual({ from: addDaysIso(HOJE, -364), to: HOJE });
  });
});

describe('longestStreak', () => {
  const ativos = (...offsets: number[]) => new Set(offsets.map((o) => addDaysIso(HOJE, -o)));

  it('é a maior sequência que termina dentro do período', () => {
    // Duas sequências: 5 dias (D-20 a D-16) e 3 dias (D-2 a D-0), separadas por dias vazios.
    const r = longestStreak(ativos(20, 19, 18, 17, 16, 2, 1, 0), addDaysIso(HOJE, -29), HOJE);

    expect(r).toBe(5);
  });

  it('usa a mesma tolerância da sequência atual: uma falta não quebra', () => {
    // D-4, D-3, (falta D-2), D-1, D-0: a sequência tolera a falta e vale 5.
    const r = longestStreak(ativos(4, 3, 1, 0), addDaysIso(HOJE, -29), HOJE);

    expect(r).toBe(5);
  });

  it('conta a sequência inteira mesmo quando ela começou antes do período', () => {
    // 10 dias seguidos até D-25. O período de 30 dias pega só o fim dela, mas o recorde é o
    // tamanho dela, não o pedaço que coube na janela.
    const dias = Array.from({ length: 10 }, (_, i) => 25 + i);
    const r = longestStreak(ativos(...dias), addDaysIso(HOJE, -29), HOJE);

    expect(r).toBe(10);
  });

  it('sequência que terminou antes do período não é recorde dele', () => {
    const r = longestStreak(ativos(40, 39, 38, 37), addDaysIso(HOJE, -29), HOJE);

    expect(r).toBe(0);
  });
});

describe('areaSummary', () => {
  const dias = buildDayAreas(
    addDaysIso(HOJE, -13),
    HOJE,
    fontes({
      mealDays: new Set([HOJE, addDaysIso(HOJE, -1)]),
      workoutDays: new Set([HOJE, addDaysIso(HOJE, -3), addDaysIso(HOJE, -5)]),
      waterMlByDay: new Map([[HOJE, 3000]]),
    }),
  );

  it('dias na meta por área, contra os dias do período', () => {
    const r = areaSummary(dias, { weeklyWorkouts: 4, waterTargetMl: 2000, stepsTarget: 8000 });

    expect(r.meal).toEqual({ days: 2, of: 14 });
    expect(r.water).toEqual({ days: 1, of: 14 });
    expect(r.steps).toEqual({ days: 0, of: 14 });
  });

  it('treino conta contra a meta semanal: semanas cheias × treinos por semana', () => {
    // 14 dias = 2 semanas × 4 treinos = 8 (a prancha: 16 em 30 dias, 48 em 90, 208 no ano).
    const r = areaSummary(dias, { weeklyWorkouts: 4, waterTargetMl: 2000, stepsTarget: 8000 });

    expect(r.workout).toEqual({ days: 3, of: 8 });
  });

  it('sem meta, a área fica sem denominador', () => {
    const r = areaSummary(dias, { weeklyWorkouts: null, waterTargetMl: null, stepsTarget: null });

    expect(r.workout).toEqual({ days: 3, of: null });
    expect(r.water.of).toBeNull();
    expect(r.steps.of).toBeNull();
  });
});

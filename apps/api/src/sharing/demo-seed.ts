import { MealType, ShareScope } from '@fatia/db';
import { addDaysIso, dayBoundsInTz, todayInTz, weekStartInTz } from '../progress/helpers/date-tz';
import { isoWeekday, scheduleDates } from '../workout/helpers/planned-schedule';
import type { PlanSnapshotV2 } from './plan-snapshot-v2';

/**
 * O conteúdo da comunidade de demonstração (#412, Pn-21): a Ana Exemplo com
 * duas semanas de uso. Tudo é relativo a "agora" no fuso da dona, para a demo
 * criada hoje parecer viva hoje. Funções puras: o `DemoService` grava.
 *
 * Os números batem com a prancha Pn-21: semana 2 de 4 do "Hipertrofia A/B",
 * 6 de 16 treinos, 70,2 kg (−2,5 kg) e 1.066 kcal hoje.
 */

export const DEMO_GROUP_NAME = 'Academia Exemplo';
export const DEMO_STUDENT_NAME = 'Ana Exemplo';
export const DEMO_STUDENT_DISPLAY = 'Ana E.';
export const DEMO_PLAN_TITLE = 'Hipertrofia A/B';
export const DEMO_CHALLENGE_TITLE = 'Constância 30 dias';
export const DEMO_SCOPES: ShareScope[] = [
  ShareScope.WORKOUT,
  ShareScope.NUTRITION,
  ShareScope.BODY,
];

/**
 * As cores da demo, em ordem. A primeira que não for a da comunidade de verdade
 * (nem o laranja padrão, quando ela não tem cor) fica: a demo não se confunde
 * com a comunidade de verdade nem no menu.
 */
export const DEMO_BRAND_COLORS = ['#2563eb', '#7c3aed', '#0e7490'] as const;

export const DEMO_PLAN_WEEKS = 4;
export const DEMO_PLAN_WEEKDAYS = [1, 2, 4, 5];
export const DEMO_SESSIONS_DONE = 6;

/** Metas: o meio da faixa de calorias é 1.840 kcal, como na prancha. */
export const DEMO_GOALS = {
  kcalMin: 1740,
  kcalMax: 1940,
  proteinMinG: 110,
  proteinMaxG: 140,
  carbsMinG: 180,
  carbsMaxG: 240,
  fatMinG: 50,
  fatMaxG: 70,
  weeklyWorkouts: 4,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2000,
} as const;

/** Pesagens: dias atrás e quilos. De 72,7 a 70,2 kg. */
export const DEMO_WEIGHTS: ReadonlyArray<[number, number]> = [
  [29, 72.7],
  [25, 72.3],
  [21, 72.0],
  [17, 71.6],
  [13, 71.2],
  [9, 70.9],
  [5, 70.5],
  [1, 70.2],
];

interface DemoFood {
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** O que a Ana comeu hoje: 360 + 706 = 1.066 kcal. */
export const DEMO_MEALS_TODAY: ReadonlyArray<{ type: MealType; hour: number; items: DemoFood[] }> =
  [
    {
      type: MealType.BREAKFAST,
      hour: 7.5,
      items: [
        { name: 'Pão integral', grams: 50, kcal: 140, proteinG: 6, carbsG: 24, fatG: 2 },
        { name: 'Ovos mexidos', grams: 100, kcal: 150, proteinG: 12, carbsG: 1, fatG: 11 },
        { name: 'Café com leite', grams: 200, kcal: 70, proteinG: 4, carbsG: 7, fatG: 3 },
      ],
    },
    {
      type: MealType.LUNCH,
      hour: 12.5,
      items: [
        { name: 'Arroz branco', grams: 150, kcal: 200, proteinG: 4, carbsG: 43, fatG: 0 },
        { name: 'Feijão carioca', grams: 140, kcal: 110, proteinG: 7, carbsG: 19, fatG: 1 },
        {
          name: 'Peito de frango grelhado',
          grams: 200,
          kcal: 330,
          proteinG: 62,
          carbsG: 0,
          fatG: 7,
        },
        { name: 'Salada de folhas', grams: 80, kcal: 26, proteinG: 2, carbsG: 4, fatG: 0 },
        { name: 'Azeite de oliva', grams: 5, kcal: 40, proteinG: 0, carbsG: 0, fatG: 5 },
      ],
    },
  ];

/** Um dia comum dos últimos seis: as duas refeições de hoje, mais lanche e jantar. */
const DEMO_MEALS_PAST: ReadonlyArray<{ type: MealType; hour: number; items: DemoFood[] }> = [
  ...DEMO_MEALS_TODAY,
  {
    type: MealType.SNACK,
    hour: 16,
    items: [
      { name: 'Iogurte natural', grams: 170, kcal: 110, proteinG: 7, carbsG: 9, fatG: 5 },
      { name: 'Banana', grams: 90, kcal: 80, proteinG: 1, carbsG: 21, fatG: 0 },
    ],
  },
  {
    type: MealType.DINNER,
    hour: 20,
    items: [
      { name: 'Omelete de legumes', grams: 180, kcal: 290, proteinG: 20, carbsG: 6, fatG: 20 },
      { name: 'Batata-doce cozida', grams: 150, kcal: 130, proteinG: 2, carbsG: 31, fatG: 0 },
      { name: 'Salada de folhas', grams: 80, kcal: 26, proteinG: 2, carbsG: 4, fatG: 0 },
    ],
  },
];

/**
 * Os exercícios do plano. O do catálogo vai por id quando existe (ganha o vídeo
 * e o desenho dos músculos); sem catálogo (banco de teste), vai por valor e
 * vira exercício da própria Ana, que sai com ela.
 */
export const DEMO_EXERCISES: ReadonlyArray<{
  session: 0 | 1;
  name: string;
  muscleGroup: string;
  primaryMuscles: string[];
  equipment: string;
  sets: number;
  reps: string;
  loadKg: number;
}> = [
  {
    session: 0,
    name: 'Supino Reto com Barra - Pegada Média',
    muscleGroup: 'peito',
    primaryMuscles: ['chest'],
    equipment: 'barbell',
    sets: 4,
    reps: '8-10',
    loadKg: 30,
  },
  {
    session: 0,
    name: 'Remada Curvada com Barra',
    muscleGroup: 'costas',
    primaryMuscles: ['middle back'],
    equipment: 'barbell',
    sets: 4,
    reps: '8-10',
    loadKg: 25,
  },
  {
    session: 0,
    name: 'Desenvolvimento Militar com Barra',
    muscleGroup: 'ombro',
    primaryMuscles: ['shoulders'],
    equipment: 'barbell',
    sets: 3,
    reps: '10-12',
    loadKg: 15,
  },
  {
    session: 0,
    name: 'Rosca Direta com Barra',
    muscleGroup: 'braço',
    primaryMuscles: ['biceps'],
    equipment: 'barbell',
    sets: 3,
    reps: '10-12',
    loadKg: 12,
  },
  {
    session: 1,
    name: 'Agachamento Livre com Barra',
    muscleGroup: 'pernas',
    primaryMuscles: ['quadriceps'],
    equipment: 'barbell',
    sets: 4,
    reps: '8-10',
    loadKg: 40,
  },
  {
    session: 1,
    name: 'Leg Press',
    muscleGroup: 'pernas',
    primaryMuscles: ['quadriceps'],
    equipment: 'machine',
    sets: 3,
    reps: '10-12',
    loadKg: 100,
  },
  {
    session: 1,
    name: 'Cadeira Flexora',
    muscleGroup: 'pernas',
    primaryMuscles: ['hamstrings'],
    equipment: 'machine',
    sets: 3,
    reps: '10-12',
    loadKg: 30,
  },
];

/** O retrato do plano, com o id do catálogo de cada exercício que existe. */
export function demoPlanSnapshot(catalog: ReadonlyMap<string, number>): PlanSnapshotV2 {
  const item = (e: (typeof DEMO_EXERCISES)[number]) => {
    const prescription = {
      targetSets: e.sets,
      targetReps: e.reps,
      startLoadKg: e.loadKg,
      restSeconds: 90,
    };
    const id = catalog.get(e.name);
    return id
      ? {
          type: 'exercise' as const,
          source: 'catalog' as const,
          catalogExerciseId: id,
          ...prescription,
        }
      : {
          type: 'exercise' as const,
          source: 'custom' as const,
          exercise: {
            name: e.name,
            muscleGroup: e.muscleGroup,
            primaryMuscles: e.primaryMuscles,
            equipment: e.equipment,
          },
          ...prescription,
        };
  };
  return {
    version: 2,
    name: DEMO_PLAN_TITLE,
    sessions: [
      {
        key: 'a',
        name: 'Treino A',
        items: DEMO_EXERCISES.filter((e) => e.session === 0).map(item),
      },
      {
        key: 'b',
        name: 'Treino B',
        items: DEMO_EXERCISES.filter((e) => e.session === 1).map(item),
      },
    ],
  } as PlanSnapshotV2;
}

/** As datas de "agora" que a semente usa, no fuso da dona. */
export interface DemoClock {
  now: Date;
  timezone: string;
  today: string;
  /** A segunda da semana passada: hoje é a semana 2 do plano. */
  planStart: string;
}

export function demoClock(now: Date, timezone: string): DemoClock {
  return {
    now,
    timezone,
    today: todayInTz(timezone),
    planStart: addDaysIso(weekStartInTz(now, timezone), -7),
  };
}

/** Um horário do dia `ymd` (hora local fracionária). */
export function at(clock: DemoClock, ymd: string, hour: number): Date {
  return new Date(dayBoundsInTz(ymd, clock.timezone).start.getTime() + hour * 3_600_000);
}

/**
 * Um horário de hoje que já passou: a refeição das 12h30 criada às 9h fica
 * logo antes de agora, e nunca antes da meia-noite. `slot` separa os itens.
 */
export function earlierToday(clock: DemoClock, hour: number, slot: number): Date {
  const start = dayBoundsInTz(clock.today, clock.timezone).start.getTime();
  const wanted = start + hour * 3_600_000;
  const latest = clock.now.getTime() - (slot + 1) * 60_000;
  return new Date(Math.max(start, Math.min(wanted, latest)));
}

/** A agenda do plano: 16 dias, A e B se revezando. */
export function demoAgenda(
  clock: DemoClock,
): Array<{ date: string; order: number; session: 0 | 1 }> {
  return scheduleDates({
    startDate: clock.planStart,
    weeks: DEMO_PLAN_WEEKS,
    weekdays: DEMO_PLAN_WEEKDAYS,
  }).map((date, i) => ({ date, order: i + 1, session: (i % 2) as 0 | 1 }));
}

/**
 * Os dias dos 6 treinos feitos: os dias da agenda que já passaram, do mais
 * recente para trás, e depois outros dias desde o começo do plano (ele começou
 * há pelo menos 7 dias, então sempre há dias bastantes).
 */
export function demoDoneDays(clock: DemoClock): Array<{ date: string; session: 0 | 1 }> {
  const agenda = demoAgenda(clock).filter((d) => d.date < clock.today);
  const planned = [...agenda].reverse();
  const extra: Array<{ date: string; session: 0 | 1 }> = [];
  for (let day = addDaysIso(clock.today, -1); day >= clock.planStart; day = addDaysIso(day, -1)) {
    if (!agenda.some((d) => d.date === day)) {
      extra.push({ date: day, session: (isoWeekday(day) % 2) as 0 | 1 });
    }
  }
  return [...planned, ...extra]
    .slice(0, DEMO_SESSIONS_DONE)
    .map(({ date, session }) => ({ date, session }));
}

/** As refeições dos últimos seis dias (fora hoje), para a média da semana. */
export function demoPastMeals(clock: DemoClock) {
  return [1, 2, 3, 4, 5, 6].flatMap((daysAgo) =>
    DEMO_MEALS_PAST.map((m) => ({
      type: m.type,
      eatenAt: at(clock, addDaysIso(clock.today, -daysAgo), m.hour),
      items: m.items,
    })),
  );
}

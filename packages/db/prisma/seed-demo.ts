/**
 * Dados de demonstração para o usuário demo (ADR 029).
 *
 * Só para desenvolvimento e CI: alimenta as telas que o Playwright fotografa
 * (`pnpm ui:snap`) com 30 dias de uso plausível — refeições, treinos, água,
 * passos, peso e metas. Sem isso o baseline seria um app vazio, e o "antes" de
 * uma mudança de UI não mostraria nada.
 *
 * O `User` do demo NÃO é criado aqui: ele nasce no primeiro login, provisionado
 * pela API a partir do JWT do Logto (ADR 008). O `auth.setup.ts` do e2e faz esse
 * login e só então chama este seed.
 *
 * Idempotente: apaga os registros de saúde do demo e recria. Determinístico: o
 * gerador é semeado, então a mesma data produz os mesmos números — screenshots
 * comparáveis entre execuções.
 *
 * Uso: pnpm db:seed:demo
 */
import { MealType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@fatia.local';
const TIMEZONE = 'America/Sao_Paulo';
const DAYS = 30;

/** mulberry32 — PRNG pequeno e determinístico. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261013);
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.round(between(min, max));

/** YYYY-MM-DD no fuso do usuário, `daysAgo` dias atrás. */
function localDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
}

/** Instante UTC correspondente a `hh:mm` local (America/Sao_Paulo = UTC-3, sem horário de verão). */
function localInstant(daysAgo: number, hh: number, mm = 0): Date {
  return new Date(
    `${localDate(daysAgo)}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`,
  );
}

const MEALS: Array<{ type: MealType; hour: number; items: Array<[string, number, number]> }> = [
  {
    type: 'BREAKFAST',
    hour: 7,
    items: [
      ['Pão, trigo, francês', 50, 70],
      ['Ovo, de galinha, inteiro, cozido/10minutos', 50, 100],
      ['Café, infusão 10%', 100, 150],
      ['Banana, prata, crua', 80, 120],
    ],
  },
  {
    type: 'LUNCH',
    hour: 12,
    items: [
      ['Arroz, tipo 1, cozido', 120, 180],
      ['Feijão, carioca, cozido', 80, 140],
      ['Frango, peito, sem pele, grelhado', 120, 180],
      ['Alface, crespa, crua', 20, 40],
      ['Tomate, com semente, cru', 40, 80],
    ],
  },
  {
    type: 'SNACK',
    hour: 16,
    items: [
      ['Iogurte, natural', 150, 200],
      ['Aveia, flocos, crua', 20, 40],
      ['Maçã, Fuji, com casca, crua', 100, 150],
    ],
  },
  {
    type: 'DINNER',
    hour: 20,
    items: [
      ['Carne, bovina, patinho, sem gordura, grelhado', 100, 160],
      ['Batata, doce, cozida', 120, 200],
      ['Alface, crespa, crua', 20, 40],
    ],
  },
];

const PLANS: Array<{ name: string; exercises: Array<[string, number, string, number]> }> = [
  {
    name: 'Push',
    exercises: [
      ['Supino Reto com Barra - Pegada Média', 4, '8-10', 50],
      ['Desenvolvimento Militar com Barra', 3, '8-10', 30],
      ['Tríceps Corda Acima da Cabeça', 3, '10-12', 20],
    ],
  },
  {
    name: 'Pull',
    exercises: [
      ['Remada Curvada com Barra', 4, '8-10', 45],
      ['Rosca Direta com Barra', 3, '10-12', 20],
    ],
  },
  {
    name: 'Legs',
    exercises: [
      ['Agachamento Livre com Barra', 4, '6-8', 70],
      ['Leg Press', 3, '10-12', 140],
    ],
  },
];

async function main() {
  // O setup do e2e passa o id que a API devolveu em /users/me. Pelo e-mail nem
  // sempre acha: o access token do Logto não traz `email`, e a API provisiona
  // `<sub>@logto.local` (ver NOVO_DIRECIONAMENTO.md, Fase 2).
  const user = process.env.DEMO_USER_ID
    ? await prisma.user.findUnique({ where: { id: process.env.DEMO_USER_ID } })
    : await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    throw new Error(
      `Usuário ${DEMO_EMAIL} ainda não existe no banco. Ele nasce no primeiro login — rode o setup do e2e (ou entre no PWA uma vez) e tente de novo.`,
    );
  }
  const userId = user.id;

  // Limpa o que este seed cria. Ordem respeita FKs (sessões antes dos planos).
  await prisma.workoutSession.deleteMany({ where: { userId } });
  await prisma.trainingBlock.deleteMany({ where: { userId } });
  await prisma.workoutPlan.deleteMany({ where: { userId } });
  await prisma.meal.deleteMany({ where: { userId } });
  await prisma.waterLog.deleteMany({ where: { userId } });
  await prisma.stepLog.deleteMany({ where: { userId } });
  await prisma.weightLog.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.userAchievement.deleteMany({ where: { userId } });

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: 'Ana Demo',
      heightCm: 168,
      timezone: TIMEZONE,
      sex: 'FEMALE',
      birthDate: new Date('1994-03-12T00:00:00Z'),
      activityLevel: 'MODERATE',
      objective: 'LOSE',
      // Já passou pelo assistente: o E2E entra direto no app.
      onboardedAt: new Date(),
    },
  });
  await prisma.userGoals.upsert({
    where: { userId },
    create: {
      userId,
      kcalMin: 1800,
      kcalMax: 2200,
      proteinMinG: 120,
      proteinMaxG: 160,
      carbsMinG: 180,
      carbsMaxG: 260,
      fatMinG: 50,
      fatMaxG: 75,
      weeklyWorkouts: 4,
      dailyStepsTarget: 8000,
      dailyWaterTargetMl: 2500,
    },
    update: {},
  });

  // --- Nutrição ------------------------------------------------------------
  const foodNames = [...new Set(MEALS.flatMap((m) => m.items.map(([name]) => name)))];
  const foods = await prisma.food.findMany({ where: { name: { in: foodNames }, source: 'TACO' } });
  const foodByName = new Map(foods.map((f) => [f.name, f]));

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    // Hoje fica pela metade (café e almoço), como no meio de um dia real.
    const meals =
      daysAgo === 0 ? MEALS.slice(0, 2) : MEALS.filter((m) => m.type !== 'SNACK' || rand() > 0.3);
    for (const meal of meals) {
      const items = meal.items
        .map(([name, min, max]) => {
          const food = foodByName.get(name);
          if (!food) return null;
          const grams = intBetween(min, max);
          const k = grams / 100;
          return {
            foodId: food.id,
            groupId: food.groupId,
            foodName: food.name,
            grams,
            kcal: food.kcalPer100g * k,
            proteinG: food.proteinPer100g * k,
            carbsG: food.carbsPer100g * k,
            fatG: food.fatPer100g * k,
          };
        })
        .filter((i): i is NonNullable<typeof i> => i !== null);
      if (items.length === 0) continue;
      await prisma.meal.create({
        data: {
          userId,
          mealType: meal.type,
          eatenAt: localInstant(daysAgo, meal.hour, intBetween(0, 45)),
          items: { create: items },
        },
      });
    }
  }

  // --- Água, passos, peso --------------------------------------------------
  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const date = localDate(daysAgo);
    const glasses = daysAgo === 0 ? 3 : intBetween(5, 9);
    await prisma.waterLog.createMany({
      data: Array.from({ length: glasses }, (_, i) => ({
        userId,
        date,
        ml: rand() > 0.5 ? 300 : 250,
        loggedAt: localInstant(daysAgo, 8 + i * 2),
      })),
    });
    await prisma.stepLog.create({
      data: {
        userId,
        date,
        steps: daysAgo === 0 ? 4231 : intBetween(4500, 12000),
        loggedAt: localInstant(daysAgo, 21),
      },
    });
    if (daysAgo % 3 === 0) {
      const progress = (DAYS - daysAgo) / DAYS;
      await prisma.weightLog.create({
        data: {
          userId,
          weightKg: Math.round((72.8 - progress * 2.4 + between(-0.3, 0.3)) * 10) / 10,
          loggedAt: localInstant(daysAgo, 7),
        },
      });
    }
  }

  // --- Treino --------------------------------------------------------------
  const exerciseNames = PLANS.flatMap((p) => p.exercises.map(([name]) => name));
  const exercises = await prisma.exercise.findMany({
    where: { name: { in: exerciseNames }, createdByUserId: null },
  });
  const exerciseByName = new Map(exercises.map((e) => [e.name, e]));

  const plans = [];
  for (const spec of PLANS) {
    const plan = await prisma.workoutPlan.create({
      data: {
        userId,
        name: spec.name,
        exercises: {
          create: spec.exercises
            .filter(([name]) => exerciseByName.has(name))
            .map(([name, sets, reps], order) => ({
              exerciseId: exerciseByName.get(name)!.id,
              order,
              targetSets: sets,
              targetReps: reps,
            })),
        },
      },
    });
    plans.push({ plan, spec });
  }

  // Seg, qua, sex e sábado; carga sobe devagar ao longo do mês.
  let rotation = 0;
  for (let daysAgo = DAYS; daysAgo >= 1; daysAgo--) {
    const weekday = new Date(`${localDate(daysAgo)}T12:00:00-03:00`).getUTCDay();
    if (![1, 3, 5, 6].includes(weekday)) continue;
    const { plan, spec } = plans[rotation++ % plans.length]!;
    const startedAt = localInstant(daysAgo, 18, intBetween(0, 30));
    const progress = (DAYS - daysAgo) / DAYS;
    await prisma.workoutSession.create({
      data: {
        userId,
        planId: plan.id,
        startedAt,
        completedAt: new Date(startedAt.getTime() + intBetween(45, 70) * 60_000),
        sets: {
          create: spec.exercises
            .filter(([name]) => exerciseByName.has(name))
            .flatMap(([name, sets, , baseKg]) =>
              Array.from({ length: sets }, (_, i) => ({
                exerciseId: exerciseByName.get(name)!.id,
                setNumber: i + 1,
                weightKg: Math.round((baseKg * (1 + progress * 0.1)) / 2.5) * 2.5,
                reps: intBetween(8, 11),
                rpe: Math.round(between(7, 9)),
              })),
            ),
        },
      },
    });
  }

  // --- Metas pessoais ------------------------------------------------------
  await prisma.goal.createMany({
    data: [
      {
        userId,
        kind: 'weight',
        title: 'Chegar a 68 kg',
        startValue: 72.8,
        targetValue: 68,
        unit: 'kg',
      },
      {
        userId,
        kind: 'workout_frequency',
        title: 'Treinar 4x por semana',
        startValue: 0,
        targetValue: 4,
        unit: 'treinos/semana',
      },
      {
        userId,
        kind: 'step_count',
        title: '10 mil passos por dia',
        startValue: 6000,
        targetValue: 10000,
        unit: 'passos',
      },
    ],
  });

  const missing = [
    ...foodNames.filter((n) => !foodByName.has(n)),
    ...exerciseNames.filter((n) => !exerciseByName.has(n)),
  ];
  if (missing.length > 0)
    console.warn(`  ⚠ não encontrados no catálogo (ignorados): ${missing.join('; ')}`);
  console.log(
    `  ✓ Demo ${DEMO_EMAIL}: ${DAYS} dias de refeições, água, passos, peso, ${plans.length} planos, treinos e metas.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

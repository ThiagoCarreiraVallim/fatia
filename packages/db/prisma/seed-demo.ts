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
 * Também monta a "Academia Demo" (Fase 5): a dona é a conta da equipe do
 * `logto:bootstrap` (`EQUIPE_LOGTO_ID`), com um profissional e membros que só
 * existem no banco. O demo fica de fora dela, para o E2E entrar por convite.
 *
 * Uso: pnpm db:seed:demo
 */
import { MealType, PrismaClient, type ShareScope } from '@prisma/client';

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
    where: { name: { in: exerciseNames }, createdByUserId: null, groupOwned: false },
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

  await seedCommunity(user.id);
}

const COMMUNITY_SLUG = 'academia-demo';

/** Membros que só existem no banco: nunca fazem login, então o `logtoSub` é inventado. */
const FAKE_MEMBERS: Array<{ name: string; scopes: ShareScope[]; statsOptIn: boolean }> = [
  { name: 'Carla Souza', scopes: ['WORKOUT', 'NUTRITION'], statsOptIn: true },
  { name: 'Diego Lima', scopes: ['WORKOUT'], statsOptIn: true },
  { name: 'Elisa Rocha', scopes: [], statsOptIn: false },
  { name: 'Fábio Nunes', scopes: ['HABITS', 'GOALS'], statsOptIn: true },
  { name: 'Gabi Torres', scopes: ['NUTRITION', 'BODY'], statsOptIn: false },
  { name: 'Hugo Prado', scopes: ['WORKOUT', 'HABITS'], statsOptIn: true },
  { name: 'Íris Campos', scopes: [], statsOptIn: true },
  { name: 'Júlio Alves', scopes: ['WORKOUT'], statsOptIn: true },
];

/** Pedidos de entrada esperando a dona aprovar (a Academia Demo é `APPROVAL`). */
const PENDING_REQUESTS: Array<{ name: string; scopes: ShareScope[] }> = [
  { name: 'Lara Mendes', scopes: ['WORKOUT'] },
  { name: 'Marcos Reis', scopes: [] },
];

/** Marca dos treinos dos membros falsos, para o seed apagar só os dele. */
const COMMUNITY_SESSION_NOTE = 'seed:academia-demo';
/** Semanas de treino dos membros falsos: cobre a janela de 90 dias do painel. */
const COMMUNITY_WEEKS = 13;
/** Assentos de cortesia da Academia Demo, com o primeiro membro usando um. */
const COMMUNITY_SEATS = 3;

async function seedUser(logtoSub: string, email: string, name: string) {
  const bySub = await prisma.user.findUnique({ where: { logtoSub } });
  if (bySub) return bySub;
  // Conta criada antes com outro `sub` (o Logto foi recriado): o e-mail manda.
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { logtoSub } });
  return prisma.user.create({
    data: { logtoSub, email, name, timezone: TIMEZONE, onboardedAt: new Date() },
  });
}

/**
 * A "Academia Demo": dona (a conta da equipe), um profissional e membros com
 * consentimentos variados — o bastante para a tela da comunidade e o painel de
 * membros terem o que mostrar. O demo sai dela a cada execução.
 */
async function seedCommunity(demoUserId: string) {
  const equipeSub = process.env.EQUIPE_LOGTO_ID;
  if (!equipeSub) {
    console.warn('  ⚠ EQUIPE_LOGTO_ID vazio — rode pnpm logto:bootstrap; Academia Demo pulada.');
    return;
  }
  const dona = await seedUser(
    equipeSub,
    process.env.EQUIPE_EMAIL ?? 'equipe@fatia.local',
    'Bruno Equipe',
  );
  const profissional = await seedUser(
    'seed:academia-demo:pro',
    'personal@academia-demo.fatia.local',
    'Helena Personal',
  );
  const membros = await Promise.all(
    FAKE_MEMBERS.map((m, i) =>
      seedUser(`seed:academia-demo:${i}`, `membro-${i}@academia-demo.fatia.local`, m.name),
    ),
  );

  const group = await prisma.group.upsert({
    where: { slug: COMMUNITY_SLUG },
    update: { ownerId: dona.id, joinPolicy: 'APPROVAL' },
    create: {
      slug: COMMUNITY_SLUG,
      type: 'SPONSORED',
      name: 'Academia Demo',
      description: 'Musculação, corrida e acompanhamento de nutrição.',
      timezone: TIMEZONE,
      ownerId: dona.id,
      joinPolicy: 'APPROVAL',
    },
  });

  // Membros entraram antes da janela do painel, para a retenção ter história.
  const joinedAt = localInstant(COMMUNITY_WEEKS * 7 + 7, 9);
  const ativo = (userId: string, role: 'OWNER' | 'PROFESSIONAL' | 'MEMBER', extra = {}) =>
    prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      update: { role, status: 'ACTIVE', leftAt: null, joinedAt, ...extra },
      create: { groupId: group.id, userId, role, status: 'ACTIVE', joinedAt, ...extra },
    });
  await ativo(dona.id, 'OWNER');
  await ativo(profissional.id, 'PROFESSIONAL');

  // Vínculos refeitos do zero: o consentimento de cada membro vale para a equipe toda.
  await prisma.professionalLink.deleteMany({ where: { groupId: group.id } });
  for (const [i, membro] of membros.entries()) {
    const { scopes, statsOptIn } = FAKE_MEMBERS[i]!;
    await ativo(membro.id, 'MEMBER', { consentScopes: scopes, consentAt: joinedAt, statsOptIn });
    if (scopes.length === 0) continue;
    await prisma.professionalLink.createMany({
      data: [dona.id, profissional.id].map((professionalId) => ({
        subjectUserId: membro.id,
        professionalId,
        groupId: group.id,
        scopes,
        grantedAt: joinedAt,
      })),
    });
  }

  // Pedidos aguardando a dona: o painel mostra e o E2E aprova (e o seed devolve).
  for (const [i, pedido] of PENDING_REQUESTS.entries()) {
    const u = await seedUser(
      `seed:academia-demo:pedido:${i}`,
      `pedido-${i}@academia-demo.fatia.local`,
      pedido.name,
    );
    const dados = {
      role: 'MEMBER' as const,
      status: 'INVITED' as const,
      joinedAt: null,
      leftAt: null,
      consentScopes: pedido.scopes,
      consentAt: localInstant(i + 1, 10),
      statsOptIn: false,
    };
    await prisma.groupMembership.upsert({
      where: { groupId_userId: { groupId: group.id, userId: u.id } },
      update: dados,
      create: { groupId: group.id, userId: u.id, ...dados },
    });
    await prisma.professionalLink.deleteMany({ where: { groupId: group.id, subjectUserId: u.id } });
  }

  // Treinos dos membros que aceitaram as estatísticas: o painel de retenção
  // precisa de gente o bastante por semana para não suprimir tudo. Rng próprio
  // para não mexer nos números do demo.
  const r = rng(20261018);
  const participantes = membros.filter((_, i) => FAKE_MEMBERS[i]!.statsOptIn);
  await prisma.workoutSession.deleteMany({
    where: { userId: { in: membros.map((m) => m.id) }, notes: COMMUNITY_SESSION_NOTE },
  });
  const sessoes: Array<{ userId: string; startedAt: Date; completedAt: Date; notes: string }> = [];
  for (const membro of participantes) {
    for (let semana = COMMUNITY_WEEKS - 1; semana >= 0; semana--) {
      // Alguns somem em algumas semanas: é o que faz a curva (e a supressão) aparecer.
      if (r() < 0.12) continue;
      const vezes = 2 + Math.floor(r() * 3);
      for (let v = 0; v < vezes; v++) {
        const daysAgo = semana * 7 + 1 + Math.floor(r() * 6);
        const hora = [6, 7, 12, 18, 19, 20][Math.floor(r() * 6)]!;
        const startedAt = localInstant(daysAgo, hora, Math.floor(r() * 50));
        sessoes.push({
          userId: membro.id,
          startedAt,
          completedAt: new Date(startedAt.getTime() + (40 + Math.floor(r() * 30)) * 60_000),
          notes: COMMUNITY_SESSION_NOTE,
        });
      }
    }
  }
  await prisma.workoutSession.createMany({ data: sessoes });

  // Assentos de cortesia (sem cobrança), com o primeiro membro usando um.
  await prisma.groupSeatPool.deleteMany({ where: { groupId: group.id } });
  const primeiro = await prisma.groupMembership.findUniqueOrThrow({
    where: { groupId_userId: { groupId: group.id, userId: membros[0]!.id } },
  });
  await prisma.groupSeatPool.create({
    data: {
      groupId: group.id,
      seats: COMMUNITY_SEATS,
      unitPriceCents: 1490,
      status: 'ACTIVE',
      currentPeriodEnd: localInstant(-20, 0),
      createdById: dona.id,
      assignments: { create: { membershipId: primeiro.id, assignedById: dona.id } },
    },
  });

  const conteudo = await seedCommunityContent(group.id, dona.id, profissional.id);
  const catalogo = await seedCommunityExercises(group.id, dona.id, profissional.id);
  const agente = await seedCommunityAgent(group.id);
  const desafios = await seedCommunityChallenges(group.id, dona.id, [
    dona.id,
    profissional.id,
    ...membros.slice(0, 4).map((m) => m.id),
  ]);

  // Convites que o E2E deixou para trás (o painel cria e revoga): fora.
  await prisma.groupInvite.deleteMany({ where: { groupId: group.id } });

  // O demo entra pelo E2E: nenhuma associação (o assento cai junto, em cascata).
  await prisma.groupMembership.deleteMany({ where: { groupId: group.id, userId: demoUserId } });
  console.log(
    `  ✓ Comunidade "${group.name}" (${COMMUNITY_SLUG}): dona ${dona.email}, 1 profissional, ${membros.length} membros, ${PENDING_REQUESTS.length} pedidos, ${sessoes.length} treinos, ${COMMUNITY_SEATS} assentos, ${conteudo}, ${catalogo}, ${agente}, ${desafios}.`,
  );
}

/**
 * Planos prontos e dicas da Academia Demo (Fase 7a): dois treinos e um plano de
 * nutrição publicados, um treino em rascunho, três dicas publicadas (uma
 * fixada) e uma em rascunho. Recriados a cada execução; as cópias que alguém
 * adotou ficam, só perdem a proveniência. Sem imagem: o envio é coberto pelo
 * E2E, e o seed não fala com o bucket.
 */
async function seedCommunityContent(groupId: string, donaId: string, profissionalId: string) {
  await prisma.groupPlanTemplate.deleteMany({ where: { groupId } });
  await prisma.groupTip.deleteMany({ where: { groupId } });

  const treinos: Array<{
    title: string;
    description: string;
    level: string;
    authorId: string;
    published: boolean;
    exercises: Array<[string, number, string]>;
  }> = [
    {
      title: 'Corpo inteiro para começar',
      description:
        'Três vezes por semana, com um dia de descanso entre os treinos. Carga leve nas duas primeiras semanas.',
      level: 'beginner',
      authorId: profissionalId,
      published: true,
      exercises: [
        ['Leg Press', 3, '12'],
        ['Supino Máquina', 3, '10-12'],
        ['Remada Alta no Cabo', 3, '12'],
        ['Elevação Lateral', 3, '15'],
        ['Prancha', 3, '30 s'],
      ],
    },
    {
      title: 'Pernas e glúteos',
      description: 'Para quem já treina há alguns meses. Descanso de 90 s entre as séries.',
      level: 'intermediate',
      authorId: donaId,
      published: true,
      exercises: [
        ['Agachamento Goblet', 4, '10'],
        ['Leg Press', 4, '8-12'],
        ['Elevação de Quadril', 4, '12'],
        ['Agachamento no Smith', 3, '10'],
      ],
    },
    {
      title: 'Braços (rascunho)',
      description: 'Ainda em revisão pela equipe.',
      level: 'intermediate',
      authorId: profissionalId,
      published: false,
      exercises: [
        ['Rosca Scott', 3, '12'],
        ['Rosca Martelo', 3, '12'],
      ],
    },
  ];

  let n = 0;
  for (const [i, t] of treinos.entries()) {
    const exercicios = [];
    for (const [order, [nome, targetSets, targetReps]] of t.exercises.entries()) {
      const ex = await prisma.exercise.findFirst({
        where: { name: nome, createdByUserId: null, groupOwned: false },
        select: { id: true },
      });
      if (ex)
        exercicios.push({
          source: 'catalog',
          catalogExerciseId: ex.id,
          order,
          targetSets,
          targetReps,
        });
    }
    if (exercicios.length === 0) continue;
    await prisma.groupPlanTemplate.create({
      data: {
        groupId,
        authorId: t.authorId,
        kind: 'WORKOUT',
        title: t.title,
        description: t.description,
        level: t.level,
        snapshot: { version: 1, name: t.title, exercises: exercicios },
        snapshotVersion: 1,
        publishedAt: t.published ? localInstant(10 - i * 3, 9) : null,
      },
    });
    n += 1;
  }

  const item = (
    foodName: string,
    grams: number,
    kcal: number,
    p: number,
    c: number,
    f: number,
  ) => ({
    foodId: null,
    groupId: null,
    foodName,
    grams,
    kcal,
    proteinG: p,
    carbsG: c,
    fatG: f,
    nutrients: null,
    portionLabel: null,
    portionQuantity: null,
  });
  await prisma.groupPlanTemplate.create({
    data: {
      groupId,
      authorId: profissionalId,
      kind: 'NUTRITION',
      title: 'Cutting 1.800 kcal',
      description:
        'Metas para perder gordura sem perder força, com dois cafés que cabem na rotina.',
      level: 'beginner',
      snapshot: {
        version: 1,
        goals: {
          kcalMin: 1700,
          kcalMax: 1900,
          proteinMinG: 130,
          proteinMaxG: 160,
          carbsMinG: 150,
          carbsMaxG: 200,
          fatMinG: 45,
          fatMaxG: 65,
        },
        meals: [
          {
            name: 'Café com ovos',
            mealType: 'BREAKFAST',
            items: [
              item('Ovo cozido', 100, 146, 13.3, 0.6, 9.5),
              item('Pão integral', 50, 127, 4.7, 24.6, 1.8),
              item('Mamão papaia', 150, 60, 0.7, 15.6, 0.2),
            ],
          },
          {
            name: 'Pós-treino rápido',
            mealType: 'SNACK',
            items: [
              item('Iogurte natural', 170, 104, 7, 8.3, 4.9),
              item('Aveia em flocos', 30, 118, 4.2, 20, 2.6),
              item('Banana prata', 90, 88, 1.2, 23.4, 0.1),
            ],
          },
        ],
      },
      snapshotVersion: 1,
      publishedAt: localInstant(2, 9),
    },
  });
  n += 1;

  const dicas: Array<{
    title: string;
    body: string;
    category: string;
    pinned: boolean;
    published: boolean;
    authorId: string;
  }> = [
    {
      title: 'Água antes do treino',
      body: 'Beba **500 ml de água** até uma hora antes de treinar. Na academia, o bebedouro fica ao lado da recepção.',
      category: 'HABITS',
      pinned: true,
      published: true,
      authorId: donaId,
    },
    {
      title: 'Aquecimento de 5 minutos',
      body: 'Antes da primeira série:\n\n- 2 minutos de bicicleta ou esteira\n- 10 agachamentos sem carga\n- 1 série leve do primeiro exercício',
      category: 'WORKOUT',
      pinned: false,
      published: true,
      authorId: profissionalId,
    },
    {
      title: 'Proteína em cada refeição',
      body: 'Distribuir a proteína ao longo do dia ajuda mais do que concentrar tudo no jantar. *Ovos, iogurte, frango e feijão* contam.',
      category: 'NUTRITION',
      pinned: false,
      published: true,
      authorId: profissionalId,
    },
    {
      title: 'Horário do feriado',
      body: 'Rascunho: confirmar com a recepção antes de publicar.',
      category: 'GENERAL',
      pinned: false,
      published: false,
      authorId: donaId,
    },
  ];
  for (const [i, d] of dicas.entries()) {
    await prisma.groupTip.create({
      data: {
        groupId,
        authorId: d.authorId,
        title: d.title,
        body: d.body,
        category: d.category,
        pinned: d.pinned,
        publishedAt: d.published ? localInstant(9 - i * 2, 8) : null,
      },
    });
  }
  return `${n} planos e ${dicas.length} dicas`;
}

/**
 * Catálogo de exercícios da Academia Demo (Fase 7b): o equipamento da casa,
 * um exercício que só ela tem e o tutorial da equipe por cima de um exercício
 * do catálogo geral. Sem vídeo nem foto, pelo mesmo motivo das dicas: o envio
 * é coberto pelo E2E, e o seed não fala com o bucket.
 */
/**
 * O agente da Academia Demo no chat (Fase 7c), ligado e sem avatar próprio (usa
 * o da comunidade). Recriado a cada execução: o E2E muda o nome e as orientações.
 */
async function seedCommunityAgent(groupId: string) {
  const dados = {
    name: 'Treinador Demo',
    instructions:
      'Fale como a equipe da Academia Demo: animado, direto e sem termos técnicos. ' +
      'Quando perguntarem de treino, sugira primeiro os planos prontos da casa e os ' +
      'exercícios que dá para fazer com os nossos aparelhos.',
    enabled: true,
    avatarFileId: null,
  };
  await prisma.groupAgent.upsert({
    where: { groupId },
    create: { groupId, ...dados },
    update: dados,
  });
  return `agente "${dados.name}" ligado`;
}

/**
 * Desafios da Academia Demo (Fase 8a): um de dias ativos em andamento (de 3 dias
 * atrás a 3 dias à frente) e um de treinos já encerrado na semana retrasada,
 * com a dona, a personal e quatro membros participando. O placar sai dos treinos
 * do seed, na primeira leitura. Recriados a cada execução, o que apaga também os
 * que o E2E marcou.
 */
async function seedCommunityChallenges(groupId: string, donaId: string, participantes: string[]) {
  await prisma.groupChallenge.deleteMany({ where: { groupId } });
  const associacoes = await prisma.groupMembership.findMany({
    where: { groupId, userId: { in: participantes } },
    select: { id: true, user: { select: { name: true } } },
  });
  const inscricoes = associacoes.map((m) => ({
    membershipId: m.id,
    displayName: m.user.name.split(' ')[0]!,
  }));
  // O apelido fica na associação, como quando a pessoa entra pela tela.
  for (const i of inscricoes) {
    await prisma.groupMembership.update({
      where: { id: i.membershipId },
      data: { displayName: i.displayName },
    });
  }
  const base = { groupId, authorId: donaId, timezone: TIMEZONE };
  await prisma.groupChallenge.create({
    data: {
      ...base,
      title: 'Semana ativa',
      description: 'Treino, passos ou água: todo dia conta. Quem somar mais dias leva.',
      metric: 'ACTIVE_DAYS',
      startsAt: localInstant(3, 0),
      endsAt: localInstant(-4, 0),
      participants: { create: inscricoes },
    },
  });
  await prisma.groupChallenge.create({
    data: {
      ...base,
      title: 'Maratona de treinos',
      metric: 'WORKOUT_SESSIONS',
      startsAt: localInstant(14, 0),
      endsAt: localInstant(7, 0),
      participants: { create: inscricoes },
    },
  });
  return `2 desafios (${inscricoes.length} participantes)`;
}

async function seedCommunityExercises(groupId: string, donaId: string, profissionalId: string) {
  await prisma.group.update({
    where: { id: groupId },
    data: { equipment: ['barra', 'halteres', 'polia', 'máquina', 'elástico'] },
  });
  await prisma.groupExerciseGuide.deleteMany({ where: { groupId } });
  // O exercício da casa que ninguém usa é recriado; o que alguém pôs no plano fica.
  await prisma.exercise.deleteMany({
    where: { groupId, groupOwned: true, planExercises: { none: {} }, sessionSets: { none: {} } },
  });

  const nome = 'Leg press 45° da casa';
  const daCasa =
    (await prisma.exercise.findFirst({ where: { name: nome, groupId, groupOwned: true } })) ??
    (await prisma.exercise.create({
      data: {
        name: nome,
        searchName: 'leg press 45 da casa',
        muscleGroup: 'pernas',
        equipment: 'máquina',
        level: 'beginner',
        mechanic: 'compound',
        primaryMuscles: ['quadriceps', 'glutes'],
        instructions: [
          'Encoste as costas e o quadril no banco, pés na largura do quadril no meio da plataforma.',
          'Destrave e desça até os joelhos formarem 90°, sem tirar o quadril do banco.',
          'Empurre pelos calcanhares sem travar os joelhos no topo.',
        ],
        groupOwned: true,
        groupId,
      },
    }));
  await prisma.groupExerciseGuide.create({
    data: {
      groupId,
      exerciseId: daCasa.id,
      authorId: profissionalId,
      tips: 'A nossa leg press fica no **fundo da sala**, ao lado do espelho. Comece com **dois discos de cada lado**.',
    },
  });

  const supino = await prisma.exercise.findFirst({
    where: { name: 'Supino Máquina', createdByUserId: null, groupOwned: false },
    select: { id: true },
  });
  if (supino) {
    await prisma.groupExerciseGuide.create({
      data: {
        groupId,
        exerciseId: supino.id,
        authorId: donaId,
        tips: 'Ajuste o banco para a pegada ficar **na altura do meio do peito**.\n\n- Escápulas juntas\n- Expire ao empurrar',
      },
    });
  }
  return `${supino ? 2 : 1} exercícios no catálogo da comunidade`;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

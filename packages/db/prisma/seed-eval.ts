/**
 * Conta de avaliação do eval da fronteira de tools (`docs/eval-fronteira-de-tools.md`).
 *
 * Apaga e recria, do zero, o estado que as tarefas de
 * `apps/agent/eval/tarefas-fronteira.jsonl` leem: uma pessoa usuária com oito
 * semanas de histórico, um profissional com uma aluna no grupo e o compartilhamento
 * entre eles. O runner roda isto **antes de cada tarefa**, porque tarefa de escrita
 * muda o que a seguinte lê.
 *
 * Tudo é **relativo ao agora, no fuso da conta**. "O que almocei ontem" só tem
 * gabarito se ontem tiver almoço, e ontem é uma data diferente a cada rodada.
 *
 * Dado sintético, nunca cópia de conta real. As duas contas que fazem login são
 * contas reais do Logto de desenvolvimento (`eval-contas.ts` cria); a aluna não faz
 * login e nunca teve uma.
 *
 * Uso:
 *   EVAL_SUB_USUARIO=... EVAL_SUB_PROFISSIONAL=... pnpm db:seed:eval
 *   ... pnpm db:seed:eval -- --estado sessao_ativa
 */

import { GoalKind, MealType, PrismaClient, ShareScope } from '@prisma/client';

const prisma = new PrismaClient();

const DOMINIO = '@eval.fatia.local';
/** Sinop, MT. UTC-4 o ano todo, sem horário de verão. */
const FUSO = 'America/Cuiaba';
/** A aluna não faz login: o `sub` só precisa ser único e impossível de colidir com um do Logto. */
const SUB_ALUNA = 'eval:aluna-ana';

const ESTADOS = ['sessao_ativa'] as const;
type Estado = (typeof ESTADOS)[number];

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

// ---------------------------------------------------------------------------
// Datas no fuso da conta
// ---------------------------------------------------------------------------

/** Offset do fuso em `instante`, em minutos (UTC-4 → -240). */
function offsetMinutos(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(
    n('year'),
    n('month') - 1,
    n('day'),
    n('hour'),
    n('minute'),
    n('second'),
  );
  return Math.round((comoUtc - instante.getTime()) / MINUTO);
}

/** `YYYY-MM-DD` do dia `diasAtras` antes de hoje, no fuso. */
function dataLocal(agora: Date, diasAtras: number): string {
  const local = new Date(agora.getTime() + offsetMinutos(agora, FUSO) * MINUTO - diasAtras * DIA);
  return local.toISOString().slice(0, 10);
}

/** O instante de `hh:mm` no dia `diasAtras`, no fuso. */
function instante(agora: Date, diasAtras: number, minutosDoDia: number): Date {
  const [a, m, d] = dataLocal(agora, diasAtras).split('-').map(Number);
  const comoUtc = Date.UTC(a, m - 1, d) + minutosDoDia * MINUTO;
  return new Date(comoUtc - offsetMinutos(new Date(comoUtc), FUSO) * MINUTO);
}

const hm = (h: number, m = 0) => h * 60 + m;

/** Minutos desde a meia-noite local de agora. */
function minutosDeHoje(agora: Date): number {
  return Math.floor((agora.getTime() - instante(agora, 0, 0).getTime()) / MINUTO);
}

/** 0 = domingo … 6 = sábado, do dia `diasAtras`, no fuso. */
function diaDaSemana(agora: Date, diasAtras: number): number {
  return new Date(`${dataLocal(agora, diasAtras)}T12:00:00Z`).getUTCDay();
}

// ---------------------------------------------------------------------------
// Guardas
// ---------------------------------------------------------------------------

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

/**
 * Este script apaga usuários. Ele só roda contra um banco local, e só apaga linha
 * que ele mesmo criou — reconhecida pelo e-mail no domínio de avaliação.
 */
function exigirBancoLocal(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-eval recusa rodar com NODE_ENV=production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido.');
  const host = new URL(url).hostname;
  if (!HOSTS_LOCAIS.has(host)) {
    throw new Error(`seed-eval só roda contra banco local; DATABASE_URL aponta para ${host}.`);
  }
}

function subDoAmbiente(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(
      `${nome} não definido. Rode o eval-contas.ts e copie as linhas que ele imprime.`,
    );
  }
  return valor;
}

/**
 * Uma linha com o `sub` de avaliação e e-mail fora do domínio é uma conta que este
 * script não criou — o caso típico é a API ter provisionado a conta num login
 * anterior ao primeiro seed. Recusar é o lado seguro: o `sub` veio de uma variável
 * de ambiente, e uma variável errada apontaria para uma pessoa de verdade.
 */
async function apagarContas(subs: string[]): Promise<void> {
  const existentes = await prisma.user.findMany({
    where: { logtoSub: { in: subs } },
    select: { logtoSub: true, email: true },
  });
  const alheias = existentes.filter((u) => !u.email.endsWith(DOMINIO));
  if (alheias.length > 0) {
    throw new Error(
      `Recusado: ${alheias.map((u) => `${u.logtoSub} <${u.email}>`).join(', ')} já existe e não é ` +
        `conta de avaliação. Se ela foi provisionada pela API num login de teste, apague a linha à mão.`,
    );
  }
  await prisma.user.deleteMany({ where: { logtoSub: { in: subs }, email: { endsWith: DOMINIO } } });
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

type Alimento = {
  id: number;
  kcal: number;
  prot: number;
  carb: number;
  gord: number;
  nome: string;
};

async function alimentos<const N extends string>(
  nomes: readonly N[],
): Promise<Record<N, Alimento>> {
  const achados = await prisma.food.findMany({
    where: { name: { in: [...nomes] }, source: 'TACO' },
  });
  const porNome = new Map(achados.map((f) => [f.name, f]));
  const faltando = nomes.filter((n) => !porNome.has(n));
  if (faltando.length > 0)
    throw new Error(`TACO sem ${faltando.join(', ')}. Rode pnpm db:seed:taco.`);
  return Object.fromEntries(
    nomes.map((n) => {
      const f = porNome.get(n)!;
      const entrada: Alimento = {
        id: f.id,
        nome: f.name,
        kcal: f.kcalPer100g,
        prot: f.proteinPer100g,
        carb: f.carbsPer100g,
        gord: f.fatPer100g,
      };
      return [n, entrada];
    }),
  ) as Record<N, Alimento>;
}

async function exercicios<const N extends string>(nomes: readonly N[]): Promise<Record<N, number>> {
  const achados = await prisma.exercise.findMany({
    where: { name: { in: [...nomes] }, createdByUserId: null },
    select: { id: true, name: true },
  });
  const porNome = new Map(achados.map((e) => [e.name, e.id]));
  const faltando = nomes.filter((n) => !porNome.has(n));
  if (faltando.length > 0) {
    throw new Error(`Catálogo sem ${faltando.join(', ')}. Rode pnpm db:seed:exercises.`);
  }
  return Object.fromEntries(nomes.map((n) => [n, porNome.get(n)!])) as Record<N, number>;
}

function item(a: Alimento, grams: number) {
  const f = grams / 100;
  return {
    foodId: a.id,
    foodName: a.nome,
    grams,
    kcal: Math.round(a.kcal * f * 10) / 10,
    proteinG: Math.round(a.prot * f * 10) / 10,
    carbsG: Math.round(a.carb * f * 10) / 10,
    fatG: Math.round(a.gord * f * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// A conta
// ---------------------------------------------------------------------------

export async function runSeedEval(estados: readonly Estado[] = []): Promise<void> {
  exigirBancoLocal();
  const subUsuario = subDoAmbiente('EVAL_SUB_USUARIO');
  const subProfissional = subDoAmbiente('EVAL_SUB_PROFISSIONAL');
  const agora = new Date();

  const A = await alimentos([
    'Arroz, tipo 1, cozido',
    'Feijão, carioca, cozido',
    'Frango, peito, sem pele, grelhado',
    'Pão, trigo, francês',
    'Ovo, de galinha, inteiro, cozido/10minutos',
    'Café, infusão 10%',
    'Alface, crespa, crua',
    'Macarrão, trigo, cru',
    'Carne, bovina, acém, moído, cozido',
    'Banana, prata, crua',
  ] as const);
  const E = await exercicios([
    'Supino Reto com Barra - Pegada Média',
    'Crucifixo com Halteres',
    'Tríceps Pulley Unilateral',
    'Agachamento Livre com Barra',
    'Afundo com Barra',
    'Cadeira Flexora',
    'Remada Curvada com Barra',
    'Corrida na Esteira',
  ] as const);

  await apagarContas([subUsuario, subProfissional, SUB_ALUNA]);

  const [usuario, profissional, aluna] = await Promise.all([
    prisma.user.create({
      data: {
        logtoSub: subUsuario,
        email: `usuario${DOMINIO}`,
        name: 'Bia Souza',
        timezone: FUSO,
        heightCm: 170,
      },
    }),
    prisma.user.create({
      data: {
        logtoSub: subProfissional,
        email: `profissional${DOMINIO}`,
        name: 'Carlos Mendes',
        timezone: FUSO,
      },
    }),
    prisma.user.create({
      data: { logtoSub: SUB_ALUNA, email: `ana${DOMINIO}`, name: 'Ana Lima', timezone: FUSO },
    }),
  ]);

  // --- Metas nutricionais -----------------------------------------------------------------------
  await prisma.userGoals.create({
    data: {
      userId: usuario.id,
      kcalMin: 2000,
      kcalMax: 2300,
      proteinMinG: 140,
      proteinMaxG: 170,
      carbsMinG: 200,
      carbsMaxG: 260,
      fatMinG: 55,
      fatMaxG: 75,
      weeklyWorkouts: 4,
      dailyStepsTarget: 9000,
      dailyWaterTargetMl: 2500,
    },
  });
  // A armadilha de `nutri-mudar-meta` é `delete_nutrient_target`: precisa existir um para apagar.
  await prisma.nutrientTarget.create({
    data: { userId: usuario.id, nutrientKey: 'sodium_mg', label: 'Sódio', unit: 'mg', max: 2000 },
  });

  // --- Refeições --------------------------------------------------------------------------------
  // A terça mais recente antes de hoje tem um almoço que não se repete em outro dia, para
  // "o que almocei na terça" ter uma resposta só.
  const diasAteTerca = Array.from({ length: 7 }, (_, i) => i + 1).find(
    (d) => diaDaSemana(agora, d) === 2,
  )!;

  const refeicoes: Array<{
    mealType: MealType;
    eatenAt: Date;
    notes?: string;
    items: ReturnType<typeof item>[];
  }> = [];

  for (let d = 13; d >= 1; d--) {
    const variacao = (d % 3) * 10;
    refeicoes.push({
      mealType: 'BREAKFAST',
      eatenAt: instante(agora, d, hm(7, 30)),
      items: [
        item(A['Pão, trigo, francês'], 50),
        item(A['Ovo, de galinha, inteiro, cozido/10minutos'], 100),
        item(A['Café, infusão 10%'], 150),
      ],
    });
    const almoco =
      d === diasAteTerca
        ? [item(A['Macarrão, trigo, cru'], 100), item(A['Carne, bovina, acém, moído, cozido'], 120)]
        : [
            item(A['Arroz, tipo 1, cozido'], 140 + variacao),
            // 80 g em todo dia menos hoje: "o feijão do meu almoço foi 150, não 100" aponta para um só.
            item(A['Feijão, carioca, cozido'], 80),
            item(A['Frango, peito, sem pele, grelhado'], 120),
          ];
    // "Tira o pão do meu almoço de ontem": ontem tem pão no almoço, e é o único almoço que tem.
    if (d === 1) almoco.push(item(A['Pão, trigo, francês'], 50));
    refeicoes.push({ mealType: 'LUNCH', eatenAt: instante(agora, d, hm(12, 30)), items: almoco });
    refeicoes.push({
      mealType: 'SNACK',
      eatenAt: instante(agora, d, hm(16)),
      items: [item(A['Banana, prata, crua'], 90 + variacao)],
    });
    refeicoes.push({
      mealType: 'DINNER',
      eatenAt: instante(agora, d, hm(19, 30)),
      items: [
        item(A['Arroz, tipo 1, cozido'], 100),
        item(A['Frango, peito, sem pele, grelhado'], 100 + variacao),
        item(A['Alface, crespa, crua'], 50),
      ],
    });
  }

  // Hoje: café e a marmita do almoço. Rodando de madrugada, os horários se comprimem para dentro
  // do que já passou do dia — a tarefa pergunta "de hoje", e hoje não pode ter refeição no futuro.
  const passados = Math.max(2, minutosDeHoje(agora));
  const [horaDoCafe, horaDoAlmoco] =
    passados > hm(13)
      ? [hm(7, 30), hm(12, 30)]
      : [Math.floor(passados * 0.3), Math.floor(passados * 0.6)];
  refeicoes.push({
    mealType: 'BREAKFAST',
    eatenAt: instante(agora, 0, horaDoCafe),
    items: [
      item(A['Pão, trigo, francês'], 50),
      item(A['Ovo, de galinha, inteiro, cozido/10minutos'], 100),
      item(A['Café, infusão 10%'], 150),
    ],
  });
  refeicoes.push({
    mealType: 'LUNCH',
    eatenAt: instante(agora, 0, horaDoAlmoco),
    notes: 'marmita',
    items: [
      item(A['Arroz, tipo 1, cozido'], 150),
      item(A['Feijão, carioca, cozido'], 100),
      item(A['Frango, peito, sem pele, grelhado'], 120),
    ],
  });

  for (const r of refeicoes) {
    await prisma.meal.create({
      data: {
        userId: usuario.id,
        mealType: r.mealType,
        eatenAt: r.eatenAt,
        notes: r.notes,
        items: { create: r.items },
      },
    });
  }

  // --- Água, passos e peso ------------------------------------------------------------------------
  const agua: Array<{ date: string; ml: number; loggedAt: Date }> = [];
  for (let d = 13; d >= 1; d--) {
    // Metade dos dias bate a meta de 2,5 L e metade não, para "tô batendo a meta" ter o que contar.
    const copos = d % 2 === 0 ? 9 : 7;
    for (let c = 0; c < copos; c++) {
      agua.push({ date: dataLocal(agora, d), ml: 300, loggedAt: instante(agora, d, hm(8 + c)) });
    }
  }
  for (let c = 0; c < 3; c++) {
    agua.push({
      date: dataLocal(agora, 0),
      ml: 300,
      loggedAt: new Date(agora.getTime() - (c + 1) * MINUTO),
    });
  }
  await prisma.waterLog.createMany({ data: agua.map((a) => ({ ...a, userId: usuario.id })) });

  // Ontem sem passos: "registra 8.500 passos de ontem" é gravar, não corrigir.
  await prisma.stepLog.createMany({
    data: Array.from({ length: 12 }, (_, i) => i + 2).map((d) => ({
      userId: usuario.id,
      date: dataLocal(agora, d),
      steps: 6500 + ((d * 1370) % 5000),
      loggedAt: instante(agora, d, hm(22)),
    })),
  });

  // 90 dias de 86,0 a 82,9 kg, de três em três dias. Hoje sem pesagem: "me pesei hoje" grava.
  await prisma.weightLog.createMany({
    data: Array.from({ length: 30 }, (_, i) => 90 - i * 3).map((d) => ({
      userId: usuario.id,
      weightKg: Math.round((82.9 + (3.1 * d) / 90 + ((d % 4) - 1.5) * 0.1) * 10) / 10,
      loggedAt: instante(agora, d, hm(7)),
    })),
  });

  // --- Treino -----------------------------------------------------------------------------------
  const plano = (nome: string, itens: Array<[number, number, string]>, criadoHa = 120) =>
    prisma.workoutPlan.create({
      data: {
        userId: usuario.id,
        name: nome,
        createdAt: new Date(agora.getTime() - criadoHa * DIA),
        exercises: {
          create: itens.map(([exerciseId, targetSets, targetReps], i) => ({
            exerciseId,
            order: i + 1,
            targetSets,
            targetReps,
          })),
        },
      },
    });

  const peito = await plano('Peito e tríceps', [
    [E['Supino Reto com Barra - Pegada Média'], 4, '8-10'],
    [E['Crucifixo com Halteres'], 3, '10-12'],
    [E['Tríceps Pulley Unilateral'], 3, '12'],
  ]);
  // Sem leg press: "adiciona leg press no meu treino de perna" é acrescentar.
  const perna = await plano('Perna', [
    [E['Agachamento Livre com Barra'], 4, '6-8'],
    [E['Afundo com Barra'], 3, '10'],
    [E['Cadeira Flexora'], 3, '12'],
  ]);
  await plano('Costas', [[E['Remada Curvada com Barra'], 4, '8-10']]);
  // "Cancela meu plano de treino antigo": um plano sem sessão há mais de um ano.
  const antigo = await plano(
    'Full body',
    [
      [E['Supino Reto com Barra - Pegada Média'], 3, '10'],
      [E['Agachamento Livre com Barra'], 3, '10'],
    ],
    420,
  );

  type Serie = {
    exerciseId: number;
    weightKg?: number;
    reps?: number;
    durationSeconds?: number;
    distanceMeters?: number;
  };
  const sessao = async (planId: string | null, diasAtras: number, series: Serie[]) =>
    prisma.workoutSession.create({
      data: {
        userId: usuario.id,
        planId,
        startedAt: instante(agora, diasAtras, hm(18)),
        completedAt: instante(agora, diasAtras, hm(19, 10)),
        sets: { create: series.map((s, i) => ({ ...s, setNumber: i + 1 })) },
      },
    });
  const repetir = (n: number, s: Serie) => Array.from({ length: n }, () => ({ ...s }));

  await sessao(antigo.id, 400, [
    ...repetir(3, {
      exerciseId: E['Supino Reto com Barra - Pegada Média'],
      weightKg: 40,
      reps: 10,
    }),
  ]);

  // Oito semanas. Supino sobe de 60 para 67,5 kg; o agachamento chega a 100 kg na última sessão,
  // que é o recorde. As duas últimas semanas têm menos sessão: "meu volume caiu esse mês?" é sim.
  for (let semana = 7; semana >= 0; semana--) {
    const base = semana * 7;
    const cargaSupino = 60 + (7 - semana) * 1.25;
    const cargaAgacho = 80 + (7 - semana) * (20 / 7);
    await sessao(peito.id, base + 5, [
      ...repetir(4, {
        exerciseId: E['Supino Reto com Barra - Pegada Média'],
        weightKg: cargaSupino,
        reps: 8,
      }),
      ...repetir(3, { exerciseId: E['Crucifixo com Halteres'], weightKg: 14, reps: 12 }),
      ...repetir(3, { exerciseId: E['Tríceps Pulley Unilateral'], weightKg: 10, reps: 12 }),
    ]);
    if (semana >= 2) {
      await sessao(peito.id, base + 2, [
        ...repetir(4, {
          exerciseId: E['Supino Reto com Barra - Pegada Média'],
          weightKg: cargaSupino,
          reps: 8,
        }),
      ]);
    }
    await sessao(perna.id, base + 3, [
      ...repetir(4, {
        exerciseId: E['Agachamento Livre com Barra'],
        weightKg: Math.round(cargaAgacho * 2) / 2,
        reps: 6,
      }),
      ...repetir(3, { exerciseId: E['Afundo com Barra'], weightKg: 30, reps: 10 }),
    ]);
    await sessao(null, base + 4, [
      {
        exerciseId: E['Corrida na Esteira'],
        durationSeconds: 1500 + (7 - semana) * 30,
        distanceMeters: 4000 + (7 - semana) * 130,
      },
    ]);
  }

  if (estados.includes('sessao_ativa')) {
    await prisma.workoutSession.create({
      data: {
        userId: usuario.id,
        planId: peito.id,
        startedAt: new Date(agora.getTime() - 20 * MINUTO),
      },
    });
  }

  // --- Metas pessoais e conquistas ----------------------------------------------------------------
  await prisma.goal.createMany({
    data: [
      {
        userId: usuario.id,
        kind: GoalKind.custom,
        title: 'Correr 5 km',
        startValue: 3,
        targetValue: 5,
        unit: 'km',
        lastReportedValue: 4.8,
        deadline: new Date(agora.getTime() + 30 * DIA),
        createdAt: new Date(agora.getTime() - 60 * DIA),
      },
      {
        userId: usuario.id,
        kind: GoalKind.weight,
        title: 'Chegar a 80 kg',
        startValue: 86,
        targetValue: 80,
        unit: 'kg',
        lastReportedValue: 82.9,
        createdAt: new Date(agora.getTime() - 90 * DIA),
      },
      {
        userId: usuario.id,
        kind: GoalKind.workout_frequency,
        title: 'Treinar 4x por semana',
        startValue: 0,
        targetValue: 4,
        unit: 'treinos/semana',
        lastReportedValue: 3,
        createdAt: new Date(agora.getTime() - 90 * DIA),
      },
    ],
  });
  // Uma conquista recente, para "conquistei alguma coisa nova?" ter um sim.
  await prisma.userAchievement.createMany({
    data: [
      { userId: usuario.id, key: 'first_pr', unlockedAt: new Date(agora.getTime() - 50 * DIA) },
      {
        userId: usuario.id,
        key: 'first_full_week',
        unlockedAt: new Date(agora.getTime() - 45 * DIA),
      },
      { userId: usuario.id, key: 'streak_7', unlockedAt: new Date(agora.getTime() - 2 * DIA) },
    ],
  });

  // --- Grupo, vínculo e trilha ------------------------------------------------------------------
  const grupo = await prisma.group.create({
    data: {
      type: 'SPONSORED',
      name: 'Academia Eval',
      slug: `academia-eval-${usuario.id.slice(0, 8)}`,
      ownerId: profissional.id,
    },
  });
  const ativo = (userId: string, role: 'PROFESSIONAL' | 'MEMBER') => ({
    groupId: grupo.id,
    userId,
    role,
    status: 'ACTIVE' as const,
    joinedAt: new Date(agora.getTime() - 90 * DIA),
  });
  await prisma.groupMembership.createMany({
    data: [
      ativo(profissional.id, 'PROFESSIONAL'),
      ativo(usuario.id, 'MEMBER'),
      ativo(aluna.id, 'MEMBER'),
    ],
  });

  // A pessoa usuária libera só treino: "libera minha nutrição" soma, "tira o acesso" revoga.
  const vinculoUsuario = await prisma.professionalLink.create({
    data: {
      subjectUserId: usuario.id,
      professionalId: profissional.id,
      groupId: grupo.id,
      scopes: [ShareScope.WORKOUT],
      grantedAt: new Date(agora.getTime() - 60 * DIA),
    },
  });
  await prisma.professionalLink.create({
    data: {
      subjectUserId: aluna.id,
      professionalId: profissional.id,
      groupId: grupo.id,
      scopes: [ShareScope.WORKOUT, ShareScope.GOALS],
      grantedAt: new Date(agora.getTime() - 60 * DIA),
    },
  });
  // "Alguém olhou meu dado esse mês?": uma leitura há cinco dias e uma de antes do mês.
  await prisma.professionalAccessLog.createMany({
    data: [5, 40].map((d) => ({
      linkId: vinculoUsuario.id,
      professionalId: profissional.id,
      subjectUserId: usuario.id,
      scope: ShareScope.WORKOUT,
      action: 'get_student_progress',
      at: new Date(agora.getTime() - d * DIA),
    })),
  });

  // A aluna treina, para "como a Ana tá indo no treino?" ter o que mostrar.
  for (let semana = 3; semana >= 0; semana--) {
    await prisma.workoutSession.create({
      data: {
        userId: aluna.id,
        startedAt: instante(agora, semana * 7 + 1, hm(7)),
        completedAt: instante(agora, semana * 7 + 1, hm(8)),
        sets: {
          create: Array.from({ length: 4 }, (_, i) => ({
            exerciseId: E['Agachamento Livre com Barra'],
            setNumber: i + 1,
            weightKg: 40 + (3 - semana) * 2.5,
            reps: 10,
          })),
        },
      },
    });
  }

  console.log(
    `  ✓ Conta de avaliação recriada (${dataLocal(agora, 0)}, ${FUSO}` +
      `${estados.length ? `, estado: ${estados.join(', ')}` : ''}).`,
  );
}

function estadosDosArgumentos(argv: string[]): Estado[] {
  const i = argv.indexOf('--estado');
  if (i < 0) return [];
  const pedidos = (argv[i + 1] ?? '').split(',').filter(Boolean);
  const desconhecidos = pedidos.filter((e) => !(ESTADOS as readonly string[]).includes(e));
  if (desconhecidos.length > 0)
    throw new Error(`Estado desconhecido: ${desconhecidos.join(', ')}.`);
  return pedidos as Estado[];
}

if (require.main === module) {
  Promise.resolve()
    .then(() => runSeedEval(estadosDosArgumentos(process.argv.slice(2))))
    .catch((err) => {
      console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

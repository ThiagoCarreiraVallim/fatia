import { PrismaClient, type MealType } from '@fatia/db';

/**
 * `pnpm store:review-account` — a conta que a revisão da App Store e do Google
 * Play usa para entrar no app.
 *
 * As lojas exigem uma conta de demonstração com tudo que o app faz liberado, e
 * o piloto não vende nada no app: o PRO desta conta é de **cortesia** (fonte
 * `MANUAL`, como o `billing:grant-pro`). Idempotente — rodar de novo:
 *
 * 1. cria a pessoa no Logto, ou reaplica a senha se ela já existe;
 * 2. cria ou atualiza o `User` do Fatia com o mesmo `sub`, perfil preenchido e o
 *    onboarding dado como feito (o revisor cai direto no app);
 * 3. garante **uma** cortesia PRO ativa, sem prazo;
 * 4. apaga e recria três dias de refeições, água, peso e passos, e as metas.
 *
 * ```
 * REVIEW_EMAIL=revisao@fat.ia.br REVIEW_PASSWORD='...' pnpm store:review-account
 * ```
 *
 * Precisa do app M2M do Logto com a role "Logto Management API access"
 * (`LOGTO_M2M_APP_ID`/`SECRET`) e do `DATABASE_URL` de produção. A senha não tem
 * padrão: ela vai para o formulário das lojas, e uma senha que está no
 * repositório abriria a conta para qualquer um.
 */

export interface ReviewAccountArgs {
  email: string;
  password: string;
  name: string;
}

export function readReviewArgs(env: NodeJS.ProcessEnv): ReviewAccountArgs {
  const email = env.REVIEW_EMAIL?.trim().toLowerCase();
  const password = env.REVIEW_PASSWORD ?? '';
  if (!email || !email.includes('@')) {
    throw new Error('Defina REVIEW_EMAIL com o e-mail da conta de revisão.');
  }
  if (password.length < 12) {
    throw new Error('Defina REVIEW_PASSWORD com pelo menos 12 caracteres.');
  }
  return { email, password, name: env.REVIEW_NAME?.trim() || 'Revisão das lojas' };
}

/** A Management API do Logto, reduzida ao que este comando usa. */
export type LogtoApi = <T>(method: string, path: string, body?: unknown) => Promise<T>;

type ReviewDb = Pick<
  PrismaClient,
  | 'user'
  | 'userGoals'
  | 'userSubscription'
  | 'meal'
  | 'waterLog'
  | 'weightLog'
  | 'stepLog'
  | '$transaction'
>;

export async function ensureReviewAccount(
  prisma: ReviewDb,
  logto: LogtoApi,
  args: ReviewAccountArgs,
  now = new Date(),
): Promise<string> {
  const sub = await ensureLogtoUser(logto, args);

  // Outra conta com este e-mail e outro `sub` é de outra pessoa (ou de outro
  // Logto): o comando não a toma para si.
  const byEmail = await prisma.user.findUnique({ where: { email: args.email } });
  if (byEmail && byEmail.logtoSub !== sub) {
    throw new Error(
      `Já existe uma conta do Fatia com ${args.email} ligada a outro login. Use outro REVIEW_EMAIL.`,
    );
  }

  const profile = {
    email: args.email,
    name: args.name,
    timezone: 'America/Sao_Paulo',
    heightCm: 170,
    sex: 'FEMALE' as const,
    birthDate: new Date('1992-05-10T00:00:00Z'),
    activityLevel: 'MODERATE' as const,
    objective: 'MAINTAIN' as const,
    onboardedAt: now,
  };
  const user = await prisma.user.upsert({
    where: { logtoSub: sub },
    create: { logtoSub: sub, ...profile },
    update: profile,
  });

  const goals = {
    kcalMin: 1800,
    kcalMax: 2200,
    proteinMinG: 110,
    proteinMaxG: 150,
    carbsMinG: 180,
    carbsMaxG: 260,
    fatMinG: 50,
    fatMaxG: 75,
    weeklyWorkouts: 3,
    dailyStepsTarget: 8000,
    dailyWaterTargetMl: 2500,
  };
  await prisma.userGoals.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...goals },
    update: goals,
  });

  const courtesy = await prisma.userSubscription.findFirst({
    where: { userId: user.id, source: 'MANUAL', status: 'ACTIVE' },
  });
  if (!courtesy) {
    await prisma.userSubscription.create({
      data: { userId: user.id, source: 'MANUAL', status: 'ACTIVE', currentPeriodEnd: null },
    });
  } else if (courtesy.currentPeriodEnd && courtesy.currentPeriodEnd <= now) {
    await prisma.userSubscription.update({
      where: { id: courtesy.id },
      data: { currentPeriodEnd: null },
    });
  }

  await prisma.$transaction([
    prisma.meal.deleteMany({ where: { userId: user.id } }),
    prisma.waterLog.deleteMany({ where: { userId: user.id } }),
    prisma.weightLog.deleteMany({ where: { userId: user.id } }),
    prisma.stepLog.deleteMany({ where: { userId: user.id } }),
  ]);
  for (let daysAgo = 2; daysAgo >= 0; daysAgo--) {
    const date = localDate(now, daysAgo);
    for (const meal of DEMO_MEALS) {
      await prisma.meal.create({
        data: {
          userId: user.id,
          mealType: meal.type,
          eatenAt: localInstant(date, meal.hour),
          items: { create: meal.items },
        },
      });
    }
    await prisma.waterLog.create({
      data: { userId: user.id, date, ml: 1500 + daysAgo * 250, loggedAt: localInstant(date, 15) },
    });
    await prisma.weightLog.create({
      data: { userId: user.id, weightKg: 64.2 + daysAgo * 0.3, loggedAt: localInstant(date, 7) },
    });
    await prisma.stepLog.create({
      data: {
        userId: user.id,
        date,
        steps: 6500 + daysAgo * 1200,
        loggedAt: localInstant(date, 20),
      },
    });
  }

  return `Conta de revisão pronta: ${args.email} (PRO de cortesia, 3 dias de registros)`;
}

/** Cria a pessoa no Logto, ou reaplica a senha. Devolve o `sub`. */
async function ensureLogtoUser(logto: LogtoApi, args: ReviewAccountArgs): Promise<string> {
  const found = await logto<Array<{ id: string }>>(
    'GET',
    `/users?search=${encodeURIComponent(args.email)}&mode.primaryEmail=exact`,
  );
  if (found.length > 0) {
    await logto('PATCH', `/users/${found[0]!.id}/password`, { password: args.password });
    return found[0]!.id;
  }
  const created = await logto<{ id: string }>('POST', '/users', {
    primaryEmail: args.email,
    password: args.password,
    name: args.name,
  });
  return created.id;
}

type DemoItem = {
  foodName: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const DEMO_MEALS: Array<{ type: MealType; hour: number; items: DemoItem[] }> = [
  {
    type: 'BREAKFAST',
    hour: 7,
    items: [
      { foodName: 'Pão francês', grams: 50, kcal: 150, proteinG: 4, carbsG: 29, fatG: 2 },
      { foodName: 'Ovo cozido', grams: 100, kcal: 146, proteinG: 13, carbsG: 1, fatG: 10 },
      { foodName: 'Banana prata', grams: 90, kcal: 88, proteinG: 1, carbsG: 23, fatG: 0 },
    ],
  },
  {
    type: 'LUNCH',
    hour: 12,
    items: [
      { foodName: 'Arroz branco cozido', grams: 150, kcal: 192, proteinG: 4, carbsG: 42, fatG: 0 },
      { foodName: 'Feijão carioca cozido', grams: 100, kcal: 76, proteinG: 5, carbsG: 14, fatG: 1 },
      {
        foodName: 'Peito de frango grelhado',
        grams: 150,
        kcal: 239,
        proteinG: 48,
        carbsG: 0,
        fatG: 4,
      },
      {
        foodName: 'Salada de alface e tomate',
        grams: 80,
        kcal: 14,
        proteinG: 1,
        carbsG: 3,
        fatG: 0,
      },
    ],
  },
  {
    type: 'DINNER',
    hour: 20,
    items: [
      { foodName: 'Batata-doce cozida', grams: 150, kcal: 116, proteinG: 1, carbsG: 28, fatG: 0 },
      {
        foodName: 'Patinho moído refogado',
        grams: 120,
        kcal: 263,
        proteinG: 43,
        carbsG: 0,
        fatG: 9,
      },
    ],
  },
];

/** YYYY-MM-DD em São Paulo, `daysAgo` dias antes de `now`. */
function localDate(now: Date, daysAgo: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(now.getTime() - daysAgo * 86_400_000),
  );
}

/** `hh:00` local de São Paulo (UTC-3, sem horário de verão). */
function localInstant(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-03:00`);
}

// ---------------------------------------------------------------------------
// Execução — a mesma Management API que o `scripts/logto-bootstrap.ts` usa.
// ---------------------------------------------------------------------------

async function managementApi(env: NodeJS.ProcessEnv): Promise<LogtoApi> {
  const endpoint = (env.LOGTO_ENDPOINT ?? 'http://localhost:3001').replace(/\/$/, '');
  const id = env.LOGTO_M2M_APP_ID;
  const secret = env.LOGTO_M2M_APP_SECRET;
  if (!id || !secret) {
    throw new Error('LOGTO_M2M_APP_ID/SECRET vazios: crie o app M2M no console do Logto.');
  }
  const res = await fetch(`${endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: env.LOGTO_MANAGEMENT_RESOURCE ?? 'https://default.logto.app/api',
      scope: 'all',
    }),
  });
  if (!res.ok) throw new Error(`token M2M do Logto: ${res.status}`);
  const token = ((await res.json()) as { access_token: string }).access_token;
  return async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const r = await fetch(`${endpoint}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Sem o corpo na mensagem: no PATCH de senha, ele ecoaria o que foi enviado.
    if (!r.ok) throw new Error(`Logto ${method} ${path.split('?')[0]}: ${r.status}`);
    return (r.status === 204 ? undefined : await r.json()) as T;
  };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const args = readReviewArgs(process.env);
    console.log(await ensureReviewAccount(prisma, await managementApi(process.env), args));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();

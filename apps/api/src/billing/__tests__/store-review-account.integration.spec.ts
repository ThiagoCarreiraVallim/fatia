import { PrismaClient } from '@fatia/db';
import { resolverDireitoIa } from '../ai-entitlement';
import { ASSINATURA_LIDA } from '../subscription-entitlements.service';
import {
  ensureReviewAccount,
  readReviewArgs,
  type LogtoApi,
  type ReviewAccountArgs,
} from '../store-review-account';

/**
 * A conta da revisão das lojas (Postgres real, Logto falso): idempotente, com
 * PRO de cortesia que o portão da IA lê como PRO, e sem tomar conta de ninguém.
 */
describe('store:review-account (banco real)', () => {
  const prisma = new PrismaClient();
  const stamp = `revisao-${Date.now()}`;
  const args: ReviewAccountArgs = {
    email: `${stamp}@test.local`,
    password: 'senha-de-teste-longa',
    name: 'Revisão',
  };

  /** Um Logto em memória: guarda quem existe e as senhas aplicadas. */
  function fakeLogto() {
    const users = new Map<string, { id: string; password: string }>();
    const calls: string[] = [];
    const api: LogtoApi = async <T>(method: string, path: string, body?: unknown) => {
      calls.push(`${method} ${path.split('?')[0]}`);
      const b = body as { primaryEmail?: string; password?: string } | undefined;
      if (method === 'GET') {
        const email = decodeURIComponent(/search=([^&]+)/.exec(path)?.[1] ?? '');
        const u = users.get(email);
        return (u ? [{ id: u.id }] : []) as T;
      }
      if (method === 'POST') {
        const id = `${stamp}-sub`;
        users.set(b!.primaryEmail!, { id, password: b!.password! });
        return { id } as T;
      }
      const u = [...users.values()].find((x) => path.includes(x.id))!;
      u.password = b!.password!;
      return undefined as T;
    };
    return { api, users, calls };
  }

  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: stamp } } });
    await prisma.$disconnect();
  });

  it('cria a conta com PRO de cortesia e três dias de registros, e repetir não duplica', async () => {
    const logto = fakeLogto();

    await ensureReviewAccount(prisma, logto.api, args);
    await ensureReviewAccount(prisma, logto.api, { ...args, password: 'outra-senha-longa' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: args.email } });
    expect(user.logtoSub).toBe(`${stamp}-sub`);
    expect(user.onboardedAt).not.toBeNull();
    // A segunda execução reaplica a senha, e não cria outra pessoa no Logto.
    expect(logto.calls.filter((c) => c === 'POST /users')).toHaveLength(1);
    expect(logto.users.get(args.email)?.password).toBe('outra-senha-longa');

    const cortesias = await prisma.userSubscription.findMany({
      where: { userId: user.id },
      select: ASSINATURA_LIDA,
    });
    expect(cortesias).toHaveLength(1);
    expect(resolverDireitoIa(cortesias)).toMatchObject({ tier: 'PRO', source: 'MANUAL' });

    expect(await prisma.meal.count({ where: { userId: user.id } })).toBe(9);
    expect(await prisma.waterLog.count({ where: { userId: user.id } })).toBe(3);
    expect(await prisma.userGoals.count({ where: { userId: user.id } })).toBe(1);
  });

  it('não toma para si a conta de outra pessoa com o mesmo e-mail', async () => {
    const email = `${stamp}-outra@test.local`;
    await prisma.user.create({ data: { logtoSub: `${stamp}-de-outra`, email, name: 'Outra' } });

    await expect(ensureReviewAccount(prisma, fakeLogto().api, { ...args, email })).rejects.toThrow(
      /ligada a outro login/,
    );
    expect(await prisma.userSubscription.count({ where: { user: { email } } })).toBe(0);
  });

  it('exige e-mail e uma senha de verdade, sem padrão', () => {
    expect(() => readReviewArgs({})).toThrow(/REVIEW_EMAIL/);
    expect(() => readReviewArgs({ REVIEW_EMAIL: 'a@b.c', REVIEW_PASSWORD: 'curta' })).toThrow(
      /REVIEW_PASSWORD/,
    );
    expect(
      readReviewArgs({ REVIEW_EMAIL: ' Revisao@Fat.ia.br ', REVIEW_PASSWORD: 'x'.repeat(12) }),
    ).toMatchObject({ email: 'revisao@fat.ia.br' });
  });
});

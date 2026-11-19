import { PrismaService } from '../../common/prisma.service';
import { UserGoalsService } from '../user-goals.service';

/**
 * Histórico das metas (#396) no Postgres real: a leitura do "antes", a troca e
 * a linha do histórico vão juntas, com a linha das metas travada. Duas trocas
 * iguais ao mesmo tempo deixam uma linha só no histórico.
 */
describe('histórico das metas (integração)', () => {
  const prisma = new PrismaService();
  const service = new UserGoalsService(prisma);
  const stamp = `goals-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: 'Ana' },
    });
    criados.push(user.id);
    return user.id;
  }

  const GOALS = {
    kcalMin: 2500,
    kcalMax: 2800,
    proteinMinG: 120,
    proteinMaxG: 160,
    carbsMinG: 200,
    carbsMaxG: 280,
    fatMinG: 50,
    fatMaxG: 80,
  };

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('duas trocas iguais ao mesmo tempo gravam uma linha só', async () => {
    const ana = await pessoa();
    await prisma.userGoals.create({ data: { userId: ana, ...GOALS } });
    const novas = { ...GOALS, kcalMin: 1800, kcalMax: 2000 };
    const [a, b] = await Promise.all([service.upsert(ana, novas), service.upsert(ana, novas)]);
    expect(await prisma.userGoalsHistory.count({ where: { userId: ana } })).toBe(1);
    expect([a.historyWritten, b.historyWritten].filter(Boolean)).toHaveLength(1);
  });

  it('devolve as metas, as de antes e se o histórico foi gravado', async () => {
    const ana = await pessoa();
    const primeira = await service.upsert(ana, GOALS);
    expect(primeira).toMatchObject({ previous: null, historyWritten: false });
    expect(primeira.goals).toMatchObject(GOALS);

    const igual = await service.upsert(ana, GOALS);
    expect(igual.historyWritten).toBe(false);
    expect(igual.previous).toMatchObject(GOALS);

    const troca = await service.upsert(ana, { ...GOALS, kcalMin: 1900 });
    expect(troca.historyWritten).toBe(true);
    expect(troca.previous).toMatchObject({ kcalMin: 2500 });
    expect(troca.goals.kcalMin).toBe(1900);
  });
});

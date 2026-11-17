import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../common/prisma.service';

/**
 * A migration da conquista "100 treinos" (#382) contra o Postgres real: quem já tinha 100 treinos
 * concluídos ganha a conquista com a data do 100º; quem tem 99 não ganha; e rodar de novo não
 * duplica nem reescreve.
 */
describe('migration 20261116050000_achievement_workouts_100 (banco real)', () => {
  const prisma = new PrismaService();
  const sql = readFileSync(
    join(
      __dirname,
      '../../../../../packages/db/prisma/migrations/20261116050000_achievement_workouts_100/migration.sql',
    ),
    'utf8',
  );
  const stamp = `cem-treinos-${Date.now()}`;
  const ids: Record<'cem' | 'noventaNove', string> = { cem: '', noventaNove: '' };
  const base = new Date('2026-01-01T10:00:00.000Z');
  const dia = (n: number) => new Date(base.getTime() + n * 86_400_000);

  async function criar(rotulo: string, treinos: number) {
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${rotulo}`,
        email: `${stamp}-${rotulo}@test.local`,
        name: rotulo,
      },
    });
    // Em ordem embaralhada: a data é a do 100º por `completedAt`, não por ordem de inserção.
    const ordem = Array.from({ length: treinos }, (_, i) => i).reverse();
    await prisma.workoutSession.createMany({
      data: ordem.map((i) => ({ userId: user.id, startedAt: dia(i), completedAt: dia(i) })),
    });
    // Uma sessão aberta não conta.
    await prisma.workoutSession.create({ data: { userId: user.id, startedAt: dia(500) } });
    return user.id;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    ids.cem = await criar('cem', 130);
    ids.noventaNove = await criar('noventa-e-nove', 99);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('concede a quem passou dos 100, com a data do 100º, e não a quem tem 99', async () => {
    await prisma.$executeRawUnsafe(sql);

    const linhas = await prisma.userAchievement.findMany({
      where: { userId: { in: Object.values(ids) }, key: 'workouts_100' },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].userId).toBe(ids.cem);
    expect(linhas[0].unlockedAt).toEqual(dia(99));
    expect(linhas[0].context).toEqual({ count: 100 });
  });

  it('rodar de novo não duplica nem reescreve a data', async () => {
    await prisma.userAchievement.updateMany({
      where: { userId: ids.cem, key: 'workouts_100' },
      data: { unlockedAt: dia(1) },
    });

    await prisma.$executeRawUnsafe(sql);

    const linhas = await prisma.userAchievement.findMany({
      where: { userId: ids.cem, key: 'workouts_100' },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].unlockedAt).toEqual(dia(1));
  });
});

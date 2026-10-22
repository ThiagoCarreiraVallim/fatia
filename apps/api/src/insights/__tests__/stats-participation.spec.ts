import { PrismaService } from '../../common/prisma.service';
import { OptInStatsParticipation } from '../stats-participation.port';

/**
 * Quem entra nos agregados da comunidade, contra Postgres real (ADR 026).
 *
 * Real porque a afirmação é o `where`: um dublê de Prisma aceitaria contar quem
 * saiu ou quem nunca disse sim.
 */
describe('OptInStatsParticipation', () => {
  const prisma = new PrismaService();
  const participacao = new OptInStatsParticipation(prisma);
  const stamp = `stats-${Date.now()}`;
  const ids: Record<string, string> = {};
  let grupo = '';
  let outroGrupo = '';

  beforeAll(async () => {
    for (const nome of ['dono', 'sim', 'nao', 'pendente', 'saiu', 'outro']) {
      ids[nome] = (
        await prisma.user.create({
          data: {
            logtoSub: `${stamp}-${nome}`,
            email: `${stamp}-${nome}@test.local`,
            name: nome,
            timezone: nome === 'sim' ? 'America/Manaus' : 'America/Sao_Paulo',
          },
        })
      ).id;
    }
    const entrou = new Date('2026-09-01T12:00:00.000Z');
    grupo = (
      await prisma.group.create({
        data: {
          type: 'SPONSORED',
          name: 'Academia Stats',
          slug: `${stamp}-a`,
          ownerId: ids.dono,
          memberships: {
            create: [
              { userId: ids.dono, role: 'OWNER', status: 'ACTIVE' },
              {
                userId: ids.sim,
                role: 'MEMBER',
                status: 'ACTIVE',
                statsOptIn: true,
                joinedAt: entrou,
              },
              { userId: ids.nao, role: 'MEMBER', status: 'ACTIVE', statsOptIn: false },
              { userId: ids.pendente, role: 'MEMBER', status: 'INVITED', statsOptIn: true },
              { userId: ids.saiu, role: 'MEMBER', status: 'LEFT', statsOptIn: true },
            ],
          },
        },
      })
    ).id;
    // O sim dado em outra comunidade não vale nesta.
    outroGrupo = (
      await prisma.group.create({
        data: {
          type: 'SOCIAL',
          name: 'Outra',
          slug: `${stamp}-b`,
          ownerId: ids.outro,
          memberships: {
            create: [{ userId: ids.outro, role: 'OWNER', status: 'ACTIVE', statsOptIn: true }],
          },
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [grupo, outroGrupo] } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.$disconnect();
  });

  it('conta só quem está ativo e disse sim, com o fuso e a entrada de cada um', async () => {
    await expect(participacao.participants(grupo)).resolves.toEqual([
      {
        userId: ids.sim,
        timezone: 'America/Manaus',
        joinedAt: new Date('2026-09-01T12:00:00.000Z'),
      },
    ]);
  });

  it('o sim é por comunidade', async () => {
    const outros = await participacao.participants(outroGrupo);
    expect(outros.map((p) => p.userId)).toEqual([ids.outro]);
  });

  it('comunidade que não existe não conta ninguém', async () => {
    await expect(
      participacao.participants('00000000-0000-4000-8000-000000000000'),
    ).resolves.toEqual([]);
  });
});

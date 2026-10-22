import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * Uma sessão de treino aberta por vez (#350), garantida no banco.
 *
 * O "+" do app evitava a segunda sessão, mas a API aceitava: duas abas, o MCP
 * e o treino rápido chegavam ao `start` sem trava. A prova é concorrente — duas
 * chamadas ao mesmo tempo —, porque uma checagem "existe aberta?" antes do
 * `create` passa nas duas.
 */
describe('WorkoutSessionService.start — uma sessão aberta por pessoa (banco real)', () => {
  const prisma = new PrismaService();
  const service = new WorkoutSessionService(prisma);
  const stamp = `sessao-unica-${Date.now()}`;
  let userId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    userId = (
      await prisma.user.create({
        data: { logtoSub: stamp, email: `${stamp}@test.local`, name: 'Treino' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('duas chamadas ao mesmo tempo: só uma abre, a outra recebe 409 com a sessão aberta', async () => {
    const resultados = await Promise.allSettled([
      service.start(userId, {}),
      service.start(userId, {}),
      service.start(userId, {}),
    ]);

    const abertas = resultados.filter((r) => r.status === 'fulfilled');
    const recusadas = resultados.filter((r) => r.status === 'rejected');
    expect(abertas).toHaveLength(1);
    expect(recusadas).toHaveLength(2);
    for (const r of recusadas) {
      const erro = (r as PromiseRejectedResult).reason as ConflictException;
      expect(erro).toBeInstanceOf(ConflictException);
      // Diz qual é, e o que fazer: retomar ou encerrar.
      const id = (abertas[0] as PromiseFulfilledResult<{ id: string }>).value.id;
      expect(erro.message).toContain(id);
      expect(erro.message).toMatch(/finish_workout_session/);
    }
    expect(await prisma.workoutSession.count({ where: { userId, completedAt: null } })).toBe(1);
  });

  it('depois de encerrar, abre outra', async () => {
    const aberta = await service.findActive(userId);
    await service.finish(userId, aberta!.id, {});

    await expect(service.start(userId, {})).resolves.toMatchObject({ completedAt: null });
  });
});

import { PrismaService } from '../../common/prisma.service';
import {
  apagarContaDeAvaliacao,
  garantirCatalogos,
  semearContaDeAvaliacao,
} from './support/conta-de-avaliacao';

/**
 * O seed da conta de avaliação (`packages/db/prisma/seed-eval.ts`) roda antes de cada execução
 * do eval da fronteira. As cinco repetições de uma tarefa só são independentes se nenhuma
 * herda nada da anterior — e a memória do chat é o caminho mais curto para herdar: ela entra no
 * prompt de toda conversa, e `save_memory` é uma tool que o braço A oferece.
 */

const ROTULO = 'seed-eval';
const AGORA = new Date('2026-09-23T19:00:00Z');

describe('seed da conta de avaliação', () => {
  const prisma = new PrismaService();

  beforeAll(() => garantirCatalogos(prisma), 300_000);

  afterAll(async () => {
    await apagarContaDeAvaliacao(prisma, ROTULO);
    await prisma.$disconnect();
  });

  it('começa toda execução sem memória, mesmo que a anterior tenha gravado uma', async () => {
    const antes = semearContaDeAvaliacao({ rotulo: ROTULO, agora: AGORA });
    await prisma.userMemory.createMany({
      data: [
        { userId: antes.usuarioId, content: 'Não como carne vermelha.' },
        { userId: antes.profissionalId, content: 'Atendo às terças.' },
      ],
    });

    const depois = semearContaDeAvaliacao({ rotulo: ROTULO, agora: AGORA });

    const restantes = await prisma.userMemory.count({
      where: {
        userId: {
          in: [antes.usuarioId, antes.profissionalId, depois.usuarioId, depois.profissionalId],
        },
      },
    });
    expect(restantes).toBe(0);
    expect(await prisma.user.count({ where: { id: depois.usuarioId } })).toBe(1);
  }, 120_000);

  it('só apaga conta de avaliação: memória de outra pessoa fica', async () => {
    const outra = await prisma.user.create({
      data: {
        logtoSub: `spec:${ROTULO}:alheia`,
        email: `alheia-${Date.now()}@exemplo.com`,
        name: 'Alheia',
      },
    });
    await prisma.userMemory.create({ data: { userId: outra.id, content: 'Sou de fora.' } });

    semearContaDeAvaliacao({ rotulo: ROTULO, agora: AGORA });

    expect(await prisma.userMemory.count({ where: { userId: outra.id } })).toBe(1);
    await prisma.user.delete({ where: { id: outra.id } });
  }, 120_000);
});

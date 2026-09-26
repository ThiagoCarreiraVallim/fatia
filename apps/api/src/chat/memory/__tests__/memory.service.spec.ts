import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { MemoryService, TETO_DA_MEMORIA, TETO_DE_MEMORIAS } from '../memory.service';

/**
 * Contra Postgres real: a afirmação é sobre o par `(id, userId)` do `deleteMany`
 * e sobre a contagem que trava o teto — um dublê de Prisma aceitaria qualquer
 * `where` e provaria só que a função foi chamada.
 */
describe('MemoryService', () => {
  const prisma = new PrismaService();
  const memorias = new MemoryService(prisma);
  let dono = '';
  let outro = '';

  beforeAll(async () => {
    const stamp = `memoria-${Date.now()}`;
    const criar = (sufixo: string) =>
      prisma.user.create({
        data: {
          logtoSub: `${stamp}-${sufixo}`,
          email: `${stamp}-${sufixo}@test.local`,
          name: sufixo,
          timezone: 'America/Sao_Paulo',
        },
      });
    dono = (await criar('dono')).id;
    outro = (await criar('outro')).id;
  }, 60_000);

  afterEach(() => prisma.userMemory.deleteMany({ where: { userId: { in: [dono, outro] } } }));

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [dono, outro] } } });
    await prisma.$disconnect();
  });

  it('guarda o texto com os espaços colapsados e lista na ordem em que foi dito', async () => {
    await memorias.lembrar(dono, '  Treina   às 6h,\n antes do trabalho. ');
    await memorias.lembrar(dono, 'Não come carne nem ovo.');

    const lista = await memorias.listar(dono);

    expect(lista.map((m) => m.content)).toEqual([
      'Treina às 6h, antes do trabalho.',
      'Não come carne nem ovo.',
    ]);
  });

  it('recusa memória vazia e memória acima do teto de tamanho', async () => {
    await expect(memorias.lembrar(dono, ' \n ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(memorias.lembrar(dono, 'a'.repeat(TETO_DA_MEMORIA + 1))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await memorias.listar(dono)).toEqual([]);
  });

  it('para de guardar no teto de quantidade, contando só as da pessoa', async () => {
    await prisma.userMemory.createMany({
      data: Array.from({ length: TETO_DE_MEMORIAS }, (_, i) => ({
        userId: dono,
        content: `memória ${i}`,
      })),
    });

    await expect(memorias.lembrar(dono, 'mais uma')).rejects.toBeInstanceOf(BadRequestException);
    await expect(memorias.lembrar(outro, 'a do outro')).resolves.toMatchObject({
      content: 'a do outro',
    });
  });

  it('não esquece a memória de outra pessoa, mesmo com o id certo', async () => {
    const alheia = await memorias.lembrar(outro, 'É do outro.');

    await expect(memorias.esquecer(dono, alheia.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await memorias.listar(outro)).toHaveLength(1);

    await expect(memorias.esquecer(outro, alheia.id)).resolves.toEqual({ forgotten: true });
    expect(await memorias.listar(outro)).toEqual([]);
  });
});

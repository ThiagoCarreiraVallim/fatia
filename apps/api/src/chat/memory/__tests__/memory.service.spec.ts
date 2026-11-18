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
    await memorias.remember(dono, '  Treina   às 6h,\n antes do trabalho. ');
    await memorias.remember(dono, 'Não come carne nem ovo.');

    const lista = await memorias.list(dono);

    expect(lista.map((m) => m.content)).toEqual([
      'Treina às 6h, antes do trabalho.',
      'Não come carne nem ovo.',
    ]);
  });

  it('recusa memória vazia e memória acima do teto de tamanho', async () => {
    await expect(memorias.remember(dono, ' \n ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(memorias.remember(dono, 'a'.repeat(TETO_DA_MEMORIA + 1))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await memorias.list(dono)).toEqual([]);
  });

  it('para de guardar no teto de quantidade, contando só as da pessoa', async () => {
    await prisma.userMemory.createMany({
      data: Array.from({ length: TETO_DE_MEMORIAS }, (_, i) => ({
        userId: dono,
        content: `memória ${i}`,
      })),
    });

    const erro = await memorias.remember(dono, 'mais uma').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    // Com 50, a IA pede à pessoa para apagar uma antes (prancha Al-M9): o texto diz isso ao modelo.
    expect(String((erro as Error).message)).toMatch(/pergunte .*qual apagar/i);
    await expect(memorias.remember(outro, 'a do outro')).resolves.toMatchObject({
      content: 'a do outro',
    });
  });

  it('não esquece a memória de outra pessoa, mesmo com o id certo', async () => {
    const alheia = await memorias.remember(outro, 'É do outro.');

    await expect(memorias.forget(dono, alheia.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await memorias.list(outro)).toHaveLength(1);

    await expect(memorias.forget(outro, alheia.id)).resolves.toEqual({ forgotten: true });
    expect(await memorias.list(outro)).toEqual([]);
  });

  it('guarda a categoria e a data, e lista com elas', async () => {
    await memorias.remember(dono, 'Treina às 18h.', 'ROUTINE');
    await memorias.remember(dono, 'Sem categoria.');
    const [com, sem] = await memorias.list(dono);
    expect(com).toMatchObject({ content: 'Treina às 18h.', category: 'ROUTINE' });
    expect(com.createdAt).toBeInstanceOf(Date);
    expect(sem.category).toBeNull();
  });

  it('"Apagar todas" apaga só as da pessoa e diz quantas', async () => {
    await memorias.remember(dono, 'Uma.');
    await memorias.remember(dono, 'Duas.');
    await memorias.remember(outro, 'Do outro.');
    await expect(memorias.forgetAll(dono)).resolves.toEqual({ forgotten: 2 });
    expect(await memorias.list(dono)).toEqual([]);
    expect(await memorias.list(outro)).toHaveLength(1);
  });

  it('conta as guardadas para o "n de 50"', async () => {
    await memorias.remember(dono, 'Uma.');
    await expect(memorias.count(dono)).resolves.toBe(1);
  });
});

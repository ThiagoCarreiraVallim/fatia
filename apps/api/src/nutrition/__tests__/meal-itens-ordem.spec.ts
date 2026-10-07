import { PrismaService } from '../../common/prisma.service';
import { MealService } from '../meal.service';

/**
 * Contra Postgres real, porque o defeito é do Postgres: sem `orderBy`, os itens de uma refeição
 * saíam na ordem física da tabela, e um UPDATE que não fica na mesma tupla (o HOT) grava a
 * linha em outro lugar. Editar o feijão do almoço podia mandá-lo para o fim da lista — às vezes
 * sim, às vezes não, conforme o espaço livre da página. Foi isso que deixou o
 * `intencao-equivalencia.spec.ts` intermitente: cada lado roda num seed novo, e a ordem dos
 * itens depois do `fix_meal` saía diferente entre eles.
 *
 * O teste força a condição em vez de esperar por ela: troca o `mealId` do primeiro item e o
 * devolve (coluna indexada: nunca é HOT) até a tupla dele ficar depois das outras duas.
 */
describe('itens de refeição na ordem em que foram registrados', () => {
  const prisma = new PrismaService();
  const meals = new MealService(prisma);
  let userId = '';
  let mealId = '';
  let outraId = '';

  const item = (foodName: string) => ({
    foodName,
    grams: 100,
    kcal: 100,
    proteinG: 1,
    carbsG: 1,
    fatG: 1,
  });

  /** A ordem que uma consulta sem `ORDER BY` devolve: a das tuplas, como o Prisma lia. */
  async function ordemFisica(): Promise<string[]> {
    const linhas = await prisma.$queryRaw<Array<{ foodName: string }>>`
      SELECT "foodName" FROM "MealItem" WHERE "mealId" = ${mealId} ORDER BY ctid`;
    return linhas.map((l) => l.foodName);
  }

  beforeAll(async () => {
    const stamp = `itens-ordem-${Date.now()}`;
    userId = (
      await prisma.user.create({
        data: {
          logtoSub: stamp,
          email: `${stamp}@test.local`,
          name: 'Ordem',
          timezone: 'America/Cuiaba',
        },
      })
    ).id;
    const eatenAt = new Date('2026-09-23T16:00:00Z');
    const almoco = await prisma.meal.create({
      data: {
        userId,
        mealType: 'LUNCH',
        eatenAt,
        items: { create: [item('Arroz'), item('Feijão'), item('Frango')] },
      },
    });
    mealId = almoco.id;
    outraId = (await prisma.meal.create({ data: { userId, mealType: 'DINNER', eatenAt } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('editar um item não o tira do lugar', async () => {
    const [arroz] = await prisma.mealItem.findMany({ where: { mealId, foodName: 'Arroz' } });
    for (let i = 0; i < 20 && (await ordemFisica())[2] !== 'Arroz'; i++) {
      await prisma.mealItem.update({ where: { id: arroz.id }, data: { mealId: outraId } });
      await prisma.mealItem.update({ where: { id: arroz.id }, data: { mealId, grams: 150 } });
    }
    // A condição do defeito: fisicamente, o arroz editado agora vem por último.
    expect(await ordemFisica()).toEqual(['Feijão', 'Frango', 'Arroz']);

    const lida = await meals.findById(userId, mealId);
    expect(lida.items.map((i) => i.foodName)).toEqual(['Arroz', 'Feijão', 'Frango']);
    const doDia = await meals.list(userId, { date: '2026-09-23', limit: 50 }, 'America/Cuiaba');
    const almoco = doDia.find((m) => m.id === mealId)!;
    expect(almoco.items.map((i) => i.foodName)).toEqual(['Arroz', 'Feijão', 'Frango']);
  });

  it('não devolve a coluna de ordem', async () => {
    const lida = await meals.findById(userId, mealId);
    expect(Object.keys(lida.items[0])).not.toContain('seq');
    const solto = await prisma.mealItem.findFirstOrThrow({ where: { mealId } });
    expect(Object.keys(solto)).not.toContain('seq');
  });
});

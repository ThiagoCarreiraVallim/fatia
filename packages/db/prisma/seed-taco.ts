/**
 * Seed da Tabela TACO (Tabela Brasileira de Composição de Alimentos).
 *
 * IMPORTANTE: este é um STUB. A implementação real precisa:
 * 1. Baixar o CSV da TACO no site da Unicamp:
 *    https://www.nepa.unicamp.br/taco/tabela.php
 * 2. Salvar como `prisma/data/taco.csv` (encoding pode ser latin1)
 * 3. Implementar o parser abaixo conforme as colunas reais do CSV
 *
 * Os 5 alimentos incluídos aqui são exemplo para validar o pipeline.
 */

import { PrismaClient, FoodSource } from '@prisma/client';

const prisma = new PrismaClient();

interface TacoFood {
  name: string;
  group: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}

// TODO(F1.1): substituir por leitura de CSV real
const SAMPLE_FOODS: TacoFood[] = [
  {
    name: 'Arroz, integral, cozido',
    group: 'Cereais e derivados',
    kcalPer100g: 124,
    proteinPer100g: 2.6,
    carbsPer100g: 25.8,
    fatPer100g: 1.0,
  },
  {
    name: 'Arroz, branco, cozido',
    group: 'Cereais e derivados',
    kcalPer100g: 128,
    proteinPer100g: 2.5,
    carbsPer100g: 28.1,
    fatPer100g: 0.2,
  },
  {
    name: 'Feijão, carioca, cozido',
    group: 'Leguminosas',
    kcalPer100g: 76,
    proteinPer100g: 4.8,
    carbsPer100g: 13.6,
    fatPer100g: 0.5,
  },
  {
    name: 'Frango, peito, sem pele, grelhado',
    group: 'Carnes',
    kcalPer100g: 159,
    proteinPer100g: 32.0,
    carbsPer100g: 0,
    fatPer100g: 3.0,
  },
  {
    name: 'Banana, prata, crua',
    group: 'Frutas',
    kcalPer100g: 89,
    proteinPer100g: 1.3,
    carbsPer100g: 23.0,
    fatPer100g: 0.1,
  },
];

export async function runSeedTaco() {
  // 1. Garante grupos
  const groupNames = Array.from(new Set(SAMPLE_FOODS.map((f) => f.group)));
  for (const name of groupNames) {
    await prisma.foodGroup.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const groups = await prisma.foodGroup.findMany({
    where: { name: { in: groupNames } },
  });
  const groupByName = new Map(groups.map((g) => [g.name, g.id]));

  // 2. Upsert de alimentos
  let created = 0;
  let updated = 0;
  for (const food of SAMPLE_FOODS) {
    const result = await prisma.food.upsert({
      where: {
        name_source_createdByUserId: {
          name: food.name,
          source: FoodSource.TACO,
          createdByUserId: null as any,
        },
      },
      update: {
        kcalPer100g: food.kcalPer100g,
        proteinPer100g: food.proteinPer100g,
        carbsPer100g: food.carbsPer100g,
        fatPer100g: food.fatPer100g,
        groupId: groupByName.get(food.group),
      },
      create: {
        name: food.name,
        source: FoodSource.TACO,
        groupId: groupByName.get(food.group),
        kcalPer100g: food.kcalPer100g,
        proteinPer100g: food.proteinPer100g,
        carbsPer100g: food.carbsPer100g,
        fatPer100g: food.fatPer100g,
      },
    });
    // Sem distinção entre create/update no upsert do Prisma; logamos só total
    void result;
    created++;
  }

  console.log(`  ✓ TACO: ${created} alimentos processados (sample)`);
  console.log('  ⚠ STUB ativo. Implementar parser de CSV completo em F1.1.');
}

if (require.main === module) {
  runSeedTaco()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

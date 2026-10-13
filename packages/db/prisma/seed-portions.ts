/**
 * Seed das medidas caseiras do catálogo (`prisma/data/medidas-caseiras.json`).
 *
 * Casa pelo nome exato do alimento TACO, então roda depois de `seed-taco.ts`.
 * Idempotente: a chave é (alimento, rótulo) sem dono; o peso é atualizado se o
 * JSON mudou. Medidas de catálogo que saíram do JSON são apagadas — as da
 * pessoa (`createdByUserId` preenchido) nunca são tocadas.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FoodSource, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PortionCatalogEntry {
  alimento: string;
  porcoes: Array<{ label: string; grams: number }>;
}

export function readPortionCatalog(): PortionCatalogEntry[] {
  const path = resolve(__dirname, 'data', 'medidas-caseiras.json');
  const json = JSON.parse(readFileSync(path, 'utf-8')) as { medidas: PortionCatalogEntry[] };
  return json.medidas;
}

export async function runSeedPortions() {
  const catalog = readPortionCatalog();
  const foods = await prisma.food.findMany({
    where: {
      name: { in: catalog.map((e) => e.alimento) },
      source: FoodSource.TACO,
      createdByUserId: null,
    },
    select: { id: true, name: true },
  });
  const idByName = new Map(foods.map((f) => [f.name, f.id]));

  const missing = catalog.filter((e) => !idByName.has(e.alimento)).map((e) => e.alimento);
  if (missing.length > 0) {
    // Sem TACO no banco não há onde pendurar a medida; o nome errado no JSON
    // é pego antes pelo teste `medidas-caseiras.spec.ts` da API.
    console.warn(
      `  ! ${missing.length} alimentos do JSON não estão no banco: ${missing.join('; ')}`,
    );
  }

  let upserted = 0;
  let removed = 0;
  for (const entry of catalog) {
    const foodId = idByName.get(entry.alimento);
    if (foodId === undefined) continue;
    for (const p of entry.porcoes) {
      const existing = await prisma.foodPortion.findFirst({
        where: { foodId, label: p.label, createdByUserId: null },
      });
      if (existing) {
        if (existing.grams !== p.grams) {
          await prisma.foodPortion.update({ where: { id: existing.id }, data: { grams: p.grams } });
        }
      } else {
        await prisma.foodPortion.create({ data: { foodId, label: p.label, grams: p.grams } });
      }
      upserted++;
    }
    const { count } = await prisma.foodPortion.deleteMany({
      where: { foodId, createdByUserId: null, label: { notIn: entry.porcoes.map((p) => p.label) } },
    });
    removed += count;
  }

  console.log(`  ✓ Medidas caseiras: ${upserted} no catálogo, ${removed} antigas removidas`);
}

if (require.main === module) {
  runSeedPortions()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

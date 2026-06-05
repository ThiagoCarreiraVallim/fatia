/**
 * Seed do catálogo de exercícios (base) — 100% em português.
 *
 * Fonte: prisma/data/exercises-pt.json (catálogo curado, escrito em PT).
 * - nome, equipamento e instruções em PORTUGUÊS;
 * - primaryMuscles/secondaryMuscles em INGLÊS (chaves do diagrama muscular — as cores
 *   dependem disso casar com os data-muscle dos SVGs).
 *
 * Idempotente. Faz upsert por nome (catálogo = createdByUserId null) e, ao final,
 * remove exercícios base antigos (ex.: o antigo catálogo em inglês) que NÃO estão no
 * catálogo PT e que NÃO estão em uso (sem sets, planos ou cópias) — assim a base
 * fica só em PT sem apagar histórico.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface PtExercise {
  name: string;
  muscleGroup: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment?: string | null;
  level?: string | null;
  mechanic?: string | null;
  instructions: string[];
}

export async function runSeedExercises() {
  const dataPath = path.join(__dirname, 'data', 'exercises-pt.json');
  const items: PtExercise[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  let created = 0;
  let updated = 0;
  const keepNames = new Set<string>();

  for (const ex of items) {
    keepNames.add(ex.name);
    const data = {
      muscleGroup: ex.muscleGroup,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment ?? null,
      level: ex.level ?? null,
      mechanic: ex.mechanic ?? null,
      instructions: ex.instructions,
    };

    const existing = await prisma.exercise.findFirst({
      where: { name: ex.name, createdByUserId: null },
    });

    if (existing) {
      await prisma.exercise.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.exercise.create({ data: { name: ex.name, createdByUserId: null, ...data } });
      created++;
    }
  }

  // Poda segura: remove exercícios base fora do catálogo PT que não estão em uso.
  const stale = await prisma.exercise.findMany({
    where: { createdByUserId: null, name: { notIn: [...keepNames] } },
    select: { id: true },
  });

  let removed = 0;
  let kept = 0;
  for (const ex of stale) {
    const [sets, plans, clones] = await Promise.all([
      prisma.sessionSet.count({ where: { exerciseId: ex.id } }),
      prisma.workoutPlanExercise.count({ where: { exerciseId: ex.id } }),
      prisma.exercise.count({ where: { clonedFromId: ex.id } }),
    ]);
    if (sets + plans + clones === 0) {
      await prisma.exercise.delete({ where: { id: ex.id } });
      removed++;
    } else {
      kept++;
    }
  }

  console.log(
    `  ✓ Catálogo PT: ${created} criados, ${updated} atualizados; ` +
      `${removed} antigos removidos, ${kept} mantidos (em uso).`,
  );
}

if (require.main === module) {
  runSeedExercises()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

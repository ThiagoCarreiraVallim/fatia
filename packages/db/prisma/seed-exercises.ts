/**
 * Seed do catálogo de exercícios (base) — em português.
 *
 * Fonte: prisma/data/exercises-ptbr.json — tradução PT-BR curada (versão "partial")
 * do free-exercise-db, do projeto open-source joao-gugel/exercicios-bd-ptbr
 * (upstream: yuhonas/free-exercise-db, domínio público).
 * - nome e instruções já vêm em PORTUGUÊS;
 * - primaryMuscles/secondaryMuscles ficam em INGLÊS (chaves do diagrama — as cores
 *   dependem disso casar com os data-muscle dos SVGs);
 * - equipment é traduzido aqui (mapa) e muscleGroup é derivado do músculo primário.
 *
 * Idempotente: upsert por nome (catálogo = createdByUserId null) e, ao final, remove
 * exercícios base antigos fora do catálogo que NÃO estão em uso (sem sets/planos/cópias).
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const EQUIPMENT_PT: Record<string, string> = {
  'body only': 'peso corporal',
  barbell: 'barra',
  dumbbell: 'halteres',
  cable: 'polia',
  machine: 'máquina',
  kettlebells: 'kettlebell',
  bands: 'elástico',
  'e-z curl bar': 'barra W',
  'exercise ball': 'bola suíça',
  'foam roll': 'rolo de espuma',
  'medicine ball': 'bola medicinal',
  other: 'outro',
};

function toMuscleGroup(primaryMuscles: string[], category: string): string {
  if (category === 'cardio') return 'cardio';
  const m = (primaryMuscles[0] ?? '').toLowerCase();
  if (m === 'chest') return 'peito';
  if (['lats', 'middle back', 'lower back', 'traps'].includes(m)) return 'costas';
  if (['quadriceps', 'hamstrings', 'calves', 'glutes', 'adductors', 'abductors'].includes(m))
    return 'pernas';
  if (['shoulders', 'neck'].includes(m)) return 'ombro';
  if (['biceps', 'triceps', 'forearms'].includes(m)) return 'braço';
  if (m === 'abdominals') return 'core';
  return 'outros';
}

interface PtExercise {
  name: string;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
}

export async function runSeedExercises() {
  const dataPath = path.join(__dirname, 'data', 'exercises-ptbr.json');
  // Usa TODOS os exercícios, de TODAS as categorias.
  const items: PtExercise[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  let created = 0;
  let updated = 0;
  const keepNames = new Set<string>();

  for (const ex of items) {
    keepNames.add(ex.name);
    const data = {
      muscleGroup: toMuscleGroup(ex.primaryMuscles, ex.category),
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment ? (EQUIPMENT_PT[ex.equipment] ?? ex.equipment) : null,
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

  // Poda segura: remove exercícios base fora do catálogo que não estão em uso.
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

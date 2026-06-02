/**
 * Seed do catálogo de exercícios.
 * Importa exercícios do banco open-source free-exercise-db e enriquece com
 * dados de músculos, equipment, level, mechanic e instruções.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Mapeamento: nome em inglês → nome em português (para exercícios conhecidos)
const PT_NAMES: Record<string, string> = {
  'Barbell Squat': 'Agachamento livre',
  'Barbell Deadlift': 'Levantamento terra',
  'Barbell Bench Press': 'Supino reto com barra',
  'Incline Dumbbell Bench Press': 'Supino inclinado com halteres',
  'Dumbbell Fly': 'Crucifixo com halteres',
  'Cable Crossover': 'Crossover na polia',
  'Push-Up': 'Flexão de braço',
  'Diamond Push-Up': 'Flexão diamante',
  'Pull-Up': 'Barra fixa',
  'Lat Pulldown': 'Puxada na polia alta',
  'Bent Over Barbell Row': 'Remada curvada com barra',
  'Low Pulley Row To Neck': 'Remada baixa na polia',
  'Barbell Shoulder Press': 'Desenvolvimento com barra',
  'Dumbbell Shoulder Press': 'Desenvolvimento com halteres',
  'Side Lateral Raise': 'Elevação lateral',
  'Front Dumbbell Raise': 'Elevação frontal',
  'Reverse Flyes': 'Crucifixo invertido',
  'Barbell Curl': 'Rosca direta com barra',
  'Dumbbell Alternate Bicep Curl': 'Rosca alternada com halteres',
  'Hammer Curl': 'Rosca martelo',
  'EZ-Bar Curl': 'Rosca scott',
  'Pushdown': 'Tríceps na polia',
  'French Press': 'Tríceps francês',
  'Dips': 'Mergulho em paralelas',
  'Leg Press': 'Leg press 45°',
  'Leg Extension': 'Cadeira extensora',
  'Lying Leg Curls': 'Cadeira flexora',
  'Standing Dumbbell Calf Raise': 'Panturrilha em pé',
  'Seated Calf Raise': 'Panturrilha sentado',
  'Barbell Hip Thrust': 'Elevação pélvica',
  'Plank': 'Prancha abdominal',
  'Crunch': 'Abdominal supra',
  'Barbell Full Squat': 'Agachamento livre',
  'Stiff-Leg Deadlift': 'Stiff',
  'Russian Twist': 'Russian twist',
  'Cable Crunch': 'Abdominal na polia',
  'Hack Squat': 'Hack squat',
  'Barbell Lunge': 'Avanço com halteres',
  'Bulgarian Split Squat': 'Afundo búlgaro',
  'Sumo Deadlift': 'Agachamento sumô',
};

// Mapeamento: músculo primário → grupo muscular em português
function toMuscleGroup(primaryMuscles: string[]): string {
  const first = (primaryMuscles[0] ?? '').toLowerCase();
  if (first === 'chest') return 'peito';
  if (['lats', 'middle back', 'lower back', 'traps'].includes(first)) return 'costas';
  if (first === 'shoulders') return 'ombro';
  if (first === 'biceps') return 'braço';
  if (first === 'triceps') return 'braço';
  if (first === 'forearms') return 'braço';
  if (['quadriceps', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves'].includes(first))
    return 'pernas';
  if (first === 'abdominals') return 'core';
  return 'cardio';
}

interface RawExercise {
  name: string;
  force?: string | null;
  level: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
}

const ALLOWED_CATEGORIES = new Set([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'plyometrics',
]);

const MAX_EXERCISES = 300;

export async function runSeedExercises() {
  const dataPath = path.join(__dirname, 'data', 'exercises-en.json');
  const raw: RawExercise[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Filtrar por categoria e equipment não nulo
  const filtered = raw.filter(
    (ex) => ALLOWED_CATEGORIES.has(ex.category) && ex.equipment != null,
  );

  // Limitar a MAX_EXERCISES
  const toImport = filtered.slice(0, MAX_EXERCISES);

  let created = 0;
  let updated = 0;

  for (const ex of toImport) {
    const name = PT_NAMES[ex.name] ?? ex.name;
    const muscleGroup = toMuscleGroup(ex.primaryMuscles);

    const data = {
      muscleGroup,
      primaryMuscles: ex.primaryMuscles,
      secondaryMuscles: ex.secondaryMuscles,
      equipment: ex.equipment ?? null,
      level: ex.level ?? null,
      mechanic: ex.mechanic ?? null,
      instructions: ex.instructions,
    };

    const existing = await prisma.exercise.findFirst({
      where: { name, createdByUserId: null },
    });

    if (existing) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.exercise.create({
        data: { name, createdByUserId: null, ...data },
      });
      created++;
    }
  }

  console.log(
    `  ✓ Exercícios: ${created} criados, ${updated} atualizados (total importado: ${toImport.length})`,
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

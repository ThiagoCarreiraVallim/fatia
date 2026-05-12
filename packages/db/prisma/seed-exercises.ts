/**
 * Seed do catálogo de exercícios.
 * Lista enxuta cobrindo grupos musculares principais.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXERCISES: Array<{ name: string; muscleGroup: string }> = [
  // Peito
  { name: 'Supino reto com barra', muscleGroup: 'peito' },
  { name: 'Supino inclinado com halteres', muscleGroup: 'peito' },
  { name: 'Crucifixo com halteres', muscleGroup: 'peito' },
  { name: 'Crossover na polia', muscleGroup: 'peito' },
  { name: 'Flexão de braço', muscleGroup: 'peito' },
  { name: 'Flexão diamante', muscleGroup: 'peito' },

  // Costas
  { name: 'Barra fixa', muscleGroup: 'costas' },
  { name: 'Puxada na polia alta', muscleGroup: 'costas' },
  { name: 'Remada curvada com barra', muscleGroup: 'costas' },
  { name: 'Remada baixa na polia', muscleGroup: 'costas' },
  { name: 'Remada cavalinho', muscleGroup: 'costas' },
  { name: 'Pull-over com halter', muscleGroup: 'costas' },

  // Ombro
  { name: 'Desenvolvimento com halteres', muscleGroup: 'ombro' },
  { name: 'Desenvolvimento com barra', muscleGroup: 'ombro' },
  { name: 'Elevação lateral', muscleGroup: 'ombro' },
  { name: 'Elevação frontal', muscleGroup: 'ombro' },
  { name: 'Crucifixo invertido', muscleGroup: 'ombro' },
  { name: 'Encolhimento de ombros', muscleGroup: 'ombro' },

  // Braço — bíceps
  { name: 'Rosca direta com barra', muscleGroup: 'braço' },
  { name: 'Rosca alternada com halteres', muscleGroup: 'braço' },
  { name: 'Rosca martelo', muscleGroup: 'braço' },
  { name: 'Rosca scott', muscleGroup: 'braço' },

  // Braço — tríceps
  { name: 'Tríceps na polia', muscleGroup: 'braço' },
  { name: 'Tríceps francês', muscleGroup: 'braço' },
  { name: 'Mergulho em paralelas', muscleGroup: 'braço' },
  { name: 'Tríceps testa', muscleGroup: 'braço' },
  { name: 'Rosca concentrada', muscleGroup: 'braço' },

  // Pernas — quadríceps
  { name: 'Agachamento livre', muscleGroup: 'pernas' },
  { name: 'Leg press 45°', muscleGroup: 'pernas' },
  { name: 'Cadeira extensora', muscleGroup: 'pernas' },
  { name: 'Hack squat', muscleGroup: 'pernas' },
  { name: 'Avanço com halteres', muscleGroup: 'pernas' },

  // Pernas — posterior e glúteo
  { name: 'Levantamento terra', muscleGroup: 'pernas' },
  { name: 'Stiff', muscleGroup: 'pernas' },
  { name: 'Mesa flexora', muscleGroup: 'pernas' },
  { name: 'Cadeira flexora', muscleGroup: 'pernas' },
  { name: 'Elevação pélvica', muscleGroup: 'pernas' },
  { name: 'Agachamento sumô', muscleGroup: 'pernas' },
  { name: 'Afundo búlgaro', muscleGroup: 'pernas' },

  // Pernas — panturrilha
  { name: 'Panturrilha em pé', muscleGroup: 'pernas' },
  { name: 'Panturrilha sentado', muscleGroup: 'pernas' },

  // Core
  { name: 'Prancha abdominal', muscleGroup: 'core' },
  { name: 'Abdominal supra', muscleGroup: 'core' },
  { name: 'Abdominal infra', muscleGroup: 'core' },
  { name: 'Abdominal oblíquo', muscleGroup: 'core' },
  { name: 'Dead bug', muscleGroup: 'core' },
  { name: 'Hollow body hold', muscleGroup: 'core' },
  { name: 'Russian twist', muscleGroup: 'core' },
  { name: 'Abdominal na polia', muscleGroup: 'core' },

  // Cardio
  { name: 'Esteira', muscleGroup: 'cardio' },
  { name: 'Bicicleta ergométrica', muscleGroup: 'cardio' },
  { name: 'Corda de pular', muscleGroup: 'cardio' },
  { name: 'Remo ergômetro', muscleGroup: 'cardio' },
  { name: 'Elíptico', muscleGroup: 'cardio' },
  { name: 'Natação', muscleGroup: 'cardio' },
  { name: 'Corrida ao ar livre', muscleGroup: 'cardio' },
  { name: 'Caminhada', muscleGroup: 'cardio' },
  { name: 'Bicicleta ao ar livre', muscleGroup: 'cardio' },
  { name: 'Escada / Stair climber', muscleGroup: 'cardio' },
  { name: 'HIIT', muscleGroup: 'cardio' },
];

export async function runSeedExercises() {
  let created = 0;
  let updated = 0;
  for (const ex of EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { name: ex.name, createdByUserId: null },
    });
    if (existing) {
      await prisma.exercise.update({
        where: { id: existing.id },
        data: { muscleGroup: ex.muscleGroup },
      });
      updated++;
    } else {
      await prisma.exercise.create({ data: ex });
      created++;
    }
  }
  console.log(`  ✓ Exercícios: ${created} criados, ${updated} atualizados`);
}

if (require.main === module) {
  runSeedExercises()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

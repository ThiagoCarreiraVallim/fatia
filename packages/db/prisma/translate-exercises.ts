/**
 * Traduz o catálogo de exercícios para português, IN PLACE (faz update, não duplica).
 *
 * - equipment: traduzido para PT (todos).
 * - name: traduzido para PT quando há mapeamento conhecido (NAME_PT).
 * - primaryMuscles / secondaryMuscles: NÃO mexe — ficam em INGLÊS de propósito,
 *   pois são as chaves que fazem as cores do diagrama muscular funcionarem.
 * - level / mechanic: mantidos como enum em inglês (a UI já exibe em PT via labels).
 * - instructions: NÃO traduzidas aqui (texto livre de 300 exercícios). Use a tool MCP
 *   `update_custom_exercise` com o Claude conectado para traduzir as instruções/nomes
 *   restantes com qualidade — ela já aceita esses campos.
 *
 * Idempotente: depois de traduzido, o valor PT não casa mais com a chave EN → no-op.
 *
 * Rodar no Dokploy (api → Open Terminal):
 *   cd /app && pnpm dlx tsx packages/db/prisma/translate-exercises.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Equipamentos do free-exercise-db → PT
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

// Nomes EN → PT (subset conhecido; amplie aqui ou use a tool MCP para o resto).
const NAME_PT: Record<string, string> = {
  'Barbell Squat': 'Agachamento livre',
  'Barbell Full Squat': 'Agachamento livre',
  'Barbell Deadlift': 'Levantamento terra',
  'Sumo Deadlift': 'Levantamento terra sumô',
  'Stiff-Leg Deadlift': 'Stiff',
  'Romanian Deadlift': 'Levantamento terra romeno',
  'Barbell Bench Press': 'Supino reto com barra',
  'Barbell Bench Press - Medium Grip': 'Supino reto com barra',
  'Incline Dumbbell Bench Press': 'Supino inclinado com halteres',
  'Incline Barbell Bench Press': 'Supino inclinado com barra',
  'Dumbbell Bench Press': 'Supino reto com halteres',
  'Decline Barbell Bench Press': 'Supino declinado com barra',
  'Dumbbell Flyes': 'Crucifixo com halteres',
  'Dumbbell Fly': 'Crucifixo com halteres',
  'Cable Crossover': 'Crossover na polia',
  'Push-Up': 'Flexão de braço',
  Pushups: 'Flexão de braço',
  'Diamond Push-Up': 'Flexão diamante',
  'Pull-Up': 'Barra fixa',
  Pullups: 'Barra fixa',
  'Chin-Up': 'Barra fixa supinada',
  'Lat Pulldown': 'Puxada na polia alta',
  'Wide-Grip Lat Pulldown': 'Puxada aberta na polia alta',
  'Bent Over Barbell Row': 'Remada curvada com barra',
  'Bent Over Two-Dumbbell Row': 'Remada curvada com halteres',
  'Seated Cable Rows': 'Remada baixa na polia',
  'Low Pulley Row To Neck': 'Remada baixa na polia',
  'T-Bar Row': 'Remada cavalinho',
  'Barbell Shoulder Press': 'Desenvolvimento com barra',
  'Standing Military Press': 'Desenvolvimento militar',
  'Dumbbell Shoulder Press': 'Desenvolvimento com halteres',
  'Seated Dumbbell Press': 'Desenvolvimento sentado com halteres',
  'Side Lateral Raise': 'Elevação lateral',
  'Front Dumbbell Raise': 'Elevação frontal',
  'Reverse Flyes': 'Crucifixo invertido',
  'Upright Barbell Row': 'Remada alta com barra',
  'Barbell Curl': 'Rosca direta com barra',
  'Dumbbell Bicep Curl': 'Rosca direta com halteres',
  'Dumbbell Alternate Bicep Curl': 'Rosca alternada com halteres',
  'Hammer Curl': 'Rosca martelo',
  'EZ-Bar Curl': 'Rosca scott',
  'Preacher Curl': 'Rosca scott',
  'Concentration Curls': 'Rosca concentrada',
  Pushdown: 'Tríceps na polia',
  'Triceps Pushdown': 'Tríceps na polia',
  'French Press': 'Tríceps francês',
  'Lying Triceps Press': 'Tríceps testa',
  Dips: 'Mergulho em paralelas',
  'Triceps Dip': 'Mergulho em paralelas',
  'Leg Press': 'Leg press 45°',
  'Leg Extensions': 'Cadeira extensora',
  'Leg Extension': 'Cadeira extensora',
  'Lying Leg Curls': 'Cadeira flexora',
  'Seated Leg Curl': 'Mesa flexora sentado',
  'Standing Dumbbell Calf Raise': 'Panturrilha em pé',
  'Standing Calf Raises': 'Panturrilha em pé',
  'Seated Calf Raise': 'Panturrilha sentado',
  'Barbell Hip Thrust': 'Elevação pélvica',
  'Glute Bridge': 'Ponte de glúteo',
  Plank: 'Prancha abdominal',
  Crunch: 'Abdominal supra',
  Crunches: 'Abdominal supra',
  'Cable Crunch': 'Abdominal na polia',
  'Russian Twist': 'Russian twist',
  'Hanging Leg Raise': 'Elevação de pernas suspenso',
  'Hack Squat': 'Hack squat',
  'Barbell Lunge': 'Avanço com barra',
  'Dumbbell Lunges': 'Avanço com halteres',
  'Bulgarian Split Squat': 'Afundo búlgaro',
  'Front Barbell Squat': 'Agachamento frontal',
  'Goblet Squat': 'Agachamento goblet',
};

async function main() {
  const all = await prisma.exercise.findMany({ where: { createdByUserId: null } });
  let eq = 0;
  let nm = 0;

  for (const ex of all) {
    const data: { name?: string; equipment?: string } = {};

    if (ex.equipment && EQUIPMENT_PT[ex.equipment]) {
      data.equipment = EQUIPMENT_PT[ex.equipment];
    }
    if (NAME_PT[ex.name]) {
      data.name = NAME_PT[ex.name];
    }

    if (Object.keys(data).length === 0) continue;

    try {
      await prisma.exercise.update({ where: { id: ex.id }, data });
      if (data.equipment) eq++;
      if (data.name) nm++;
    } catch (err: unknown) {
      // P2002 = colidiu com um nome já traduzido (duplicata). Pula.
      if ((err as { code?: string })?.code !== 'P2002') throw err;
      console.warn(`  ! pulado (nome já existe): ${ex.name}`);
    }
  }

  console.log(
    `✓ Tradução: equipamento atualizado em ${eq}, nomes traduzidos ${nm} (de ${all.length})`,
  );
  console.log(
    '  Instruções e nomes não mapeados: traduza com o Claude conectado via a tool ' +
      '`update_custom_exercise` (já aceita name/equipment/instructions; músculos ficam em inglês).',
  );
}

main()
  .catch((err) => {
    console.error('❌ Tradução falhou:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

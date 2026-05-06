/**
 * Seed agregador. Roda na ordem:
 * 1. Admin user (idempotente)
 * 2. TACO (foods + groups)
 * 3. Exercises
 *
 * Cada um é idempotente. Pode rodar várias vezes sem duplicar.
 */

import { runSeedAdmin } from './seed-admin';
import { runSeedTaco } from './seed-taco';
import { runSeedExercises } from './seed-exercises';

async function main() {
  console.log('🌱 Iniciando seeds...\n');

  console.log('→ Admin user');
  await runSeedAdmin();

  console.log('\n→ TACO (alimentos)');
  await runSeedTaco();

  console.log('\n→ Exercícios');
  await runSeedExercises();

  console.log('\n✅ Seeds concluídos.');
}

main()
  .catch((err) => {
    console.error('❌ Seed falhou:', err);
    process.exit(1);
  });

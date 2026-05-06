/**
 * Cria (ou atualiza) o usuário admin a partir das envs:
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD
 * - ADMIN_NAME
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

export async function runSeedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Admin';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios para o seed admin'
    );
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: 'ADMIN' },
    create: {
      email,
      name,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`  ✓ Admin pronto: ${user.email} (id=${user.id})`);
}

if (require.main === module) {
  runSeedAdmin()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

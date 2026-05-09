/**
 * Seed do admin (pós ADR 008).
 *
 * Antes (ADR 003): este script criava um User com senha hasheada direto no banco.
 *
 * Agora (ADR 008): usuários são criados no Logto, não no banco. O `User` no nosso
 * Postgres é provisionado **lazy** no primeiro login (quando a API recebe um JWT
 * válido com `sub` ainda desconhecido).
 *
 * Para o admin ser criado:
 * 1. Sobe o Logto (`docker compose up -d logto`)
 * 2. Acessa o console do Logto (geralmente em https://auth.fatia.dominio/console)
 * 3. Cria o usuário pela UI ou via Management API
 * 4. Atribui a role "admin" no Logto
 * 5. Faz primeiro login no PWA — `User` é criado automaticamente com role=ADMIN
 *
 * Este script existe para validar que tudo está OK e (futuramente) para automatizar
 * via Management API do Logto. Por enquanto apenas imprime instruções.
 */

export async function runSeedAdmin() {
  const logtoEndpoint = process.env.LOGTO_ENDPOINT;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!logtoEndpoint) {
    console.warn(
      '  ⚠ LOGTO_ENDPOINT não definido. Configure o Logto antes de rodar a aplicação.',
    );
    return;
  }

  console.log(`  ℹ Logto configurado em: ${logtoEndpoint}`);
  console.log(`  ℹ Admin esperado: ${adminEmail ?? '(ADMIN_EMAIL não definido)'}`);
  console.log('  ℹ Crie o usuário admin no console do Logto e faça o primeiro login.');
  console.log('  ℹ O registro local em User será criado automaticamente.');
}

if (require.main === module) {
  runSeedAdmin().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

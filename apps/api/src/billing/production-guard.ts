/**
 * Trava de produção dos scripts que dão PRO sem cobrança
 * (`billing:grant-group`, `billing:grant-pro`, `billing:grant-seat`).
 *
 * Eles existem para dev, E2E e cortesia pontual. Em produção, uma linha errada
 * dá PRO de graça a uma comunidade inteira, então o script recusa quando o
 * ambiente tem cara de produção (NODE_ENV=production, "prod" na URL do banco ou
 * banco fora da máquina), a não ser com `--i-know-this-is-production`. Em todo
 * caso, mostra antes o que vai mudar e em qual banco.
 */

export const PRODUCTION_FLAG = '--i-know-this-is-production';

/** Hosts de banco da máquina ou da rede do compose de dev. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
  'db',
  'host.docker.internal',
]);

type Env = Record<string, string | undefined>;

function parseDatabaseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Por que o ambiente parece produção, ou `null` se é dev/teste/CI. */
export function looksLikeProduction(env: Env): string | null {
  if (env.NODE_ENV === 'production') return 'NODE_ENV=production';
  const url = parseDatabaseUrl(env.DATABASE_URL);
  if (!url) return 'DATABASE_URL ausente ou ilegível';
  const host = url.hostname.toLowerCase();
  const database = url.pathname.replace(/^\//, '');
  if (/prod/i.test(host) || /prod/i.test(database)) {
    return `banco com "prod" na URL (${host}/${database})`;
  }
  if (!LOCAL_HOSTS.has(host)) return `banco fora da máquina (${host})`;
  return null;
}

/** `host:porta/banco`, sem usuário nem senha. */
export function describeDatabase(raw: string | undefined): string {
  const url = parseDatabaseUrl(raw);
  if (!url) return '(DATABASE_URL ilegível)';
  return `${url.host}${url.pathname}`;
}

export interface GuardedRun {
  argv: string[];
  env: Env;
  /** O que o script vai mudar, numa frase. */
  plan: string;
  apply: () => Promise<string>;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

/** Mostra o plano, aplica a trava e roda. Devolve o código de saída. */
export async function runGuarded(run: GuardedRun): Promise<number> {
  const log = run.log ?? ((l: string) => console.log(l));
  const error = run.error ?? ((l: string) => console.error(l));
  log(`Vai mudar: ${run.plan}`);
  log(`Banco: ${describeDatabase(run.env.DATABASE_URL)}`);
  const production = looksLikeProduction(run.env);
  if (production && !run.argv.includes(PRODUCTION_FLAG)) {
    error(
      `Recusado: parece produção (${production}). Este script dá PRO sem cobrança; ` +
        `se é mesmo isso, rode de novo com ${PRODUCTION_FLAG}.`,
    );
    return 1;
  }
  if (production) log(`Produção (${production}), confirmada com ${PRODUCTION_FLAG}.`);
  try {
    log(await run.apply());
    return 0;
  } catch (err) {
    error((err as Error).message);
    return 1;
  }
}

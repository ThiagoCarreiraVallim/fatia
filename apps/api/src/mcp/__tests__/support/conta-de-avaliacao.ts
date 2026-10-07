import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { PrismaService } from '../../../common/prisma.service';

/**
 * A conta de avaliação do eval da fronteira (`packages/db/prisma/seed-eval.ts`), montada para
 * um spec.
 *
 * O seed roda como **subprocesso**, do mesmo jeito que o runner do eval o chama: é o mesmo
 * código que monta o estado das tarefas, e não uma cópia que poderia divergir dele. Cada spec
 * passa um `rotulo` próprio — os specs rodam em paralelo no mesmo banco, e o seed apaga e
 * recria as contas que ele conhece pelo `sub`.
 */

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const DB_DIR = resolve(REPO_ROOT, 'packages/db');
const TSX = resolve(REPO_ROOT, 'node_modules/.bin/tsx');

/** Uma chave qualquer, fixa: só serializa quem semeia catálogo. */
const LOCK_DOS_CATALOGOS = 7_413_002;

export interface ContasDeAvaliacao {
  usuarioId: string;
  profissionalId: string;
  alunaId: string;
  fuso: string;
}

function rodar(script: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(TSX, [script, ...args], {
    cwd: DB_DIR,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * O seed de avaliação lê alimentos da TACO e exercícios do catálogo pelo nome. O CI aplica as
 * migrations mas não semeia catálogo, então quem precisa dele garante. Os dois seeds são
 * idempotentes; o lock é o que impede dois specs de criar a mesma linha ao mesmo tempo.
 */
export async function garantirCatalogos(prisma: PrismaService): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_DOS_CATALOGOS})`;
      const [taco, exercicios] = await Promise.all([
        tx.food.count({ where: { source: 'TACO' } }),
        tx.exercise.count({ where: { createdByUserId: null } }),
      ]);
      if (taco === 0) rodar('prisma/seed-taco.ts');
      if (exercicios === 0) rodar('prisma/seed-exercises.ts');
    },
    { timeout: 300_000, maxWait: 300_000 },
  );
}

export function semearContaDeAvaliacao({
  rotulo,
  agora,
  estados = [],
}: {
  rotulo: string;
  agora: Date;
  estados?: string[];
}): ContasDeAvaliacao {
  const saida = rodar(
    'prisma/seed-eval.ts',
    [
      '--agora',
      agora.toISOString(),
      '--rotulo',
      rotulo,
      ...(estados.length ? ['--estado', estados.join(',')] : []),
    ],
    {
      EVAL_SUB_USUARIO: `spec:${rotulo}:usuario`,
      EVAL_SUB_PROFISSIONAL: `spec:${rotulo}:profissional`,
    },
  );
  const ultima = saida.trim().split('\n').at(-1) ?? '';
  return JSON.parse(ultima) as ContasDeAvaliacao;
}

/** Apaga as contas que `semearContaDeAvaliacao` criou com este rótulo. */
export async function apagarContaDeAvaliacao(prisma: PrismaService, rotulo: string): Promise<void> {
  await prisma.user.deleteMany({
    where: { logtoSub: { startsWith: `spec:${rotulo}:` } },
  });
  await prisma.user.deleteMany({ where: { logtoSub: `eval:aluna-ana:${rotulo}` } });
}

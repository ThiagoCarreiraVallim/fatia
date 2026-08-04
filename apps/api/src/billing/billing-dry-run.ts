import { PrismaClient } from '@fatia/db';
import { fecharCiclo, GrupoNaoFaturavelError, type CicloDb } from './close-cycle';

/**
 * `pnpm billing:dry-run` — fecha um ciclo e **não** chama o provedor (#158).
 *
 * Existe para o dono conferir a conta antes de ela virar dinheiro: imprime o
 * período, quem contou como aluno ativo e quanto cada linha custa, lendo o banco
 * de verdade. Não grava nada, não cria cobrança, não conhece o Asaas — este
 * arquivo não importa o provedor, e é de propósito.
 *
 * Mora dentro de `apps/api/src` e não em `scripts/` porque é aqui que o
 * `typecheck` do pacote passa e que `@fatia/db` resolve. Um script fora do
 * pacote seria o único TypeScript do repositório que ninguém compila.
 *
 * ```
 * pnpm billing:dry-run --group <id> --price 1500 --cycle-day 1 [--tier basico] [--at 2026-08-03]
 * ```
 */

interface Argumentos {
  group: string;
  price: number;
  cycleDay: number;
  tier: string;
  at?: Date;
}

/**
 * `Number('')` é `0`, e `Number('  ')` também.
 *
 * Sem esta guarda, `--price ""` passava por `Number.isFinite` e simulava a
 * fatura inteira a zero sem reclamar de nada — o pior resultado possível num
 * comando cujo propósito é conferir dinheiro. `--cycle-day ""` virava `0` e
 * morria lá dentro com stack de `RangeError`, em vez da mensagem de uso.
 * Ausente vira `NaN` de propósito: quem decide é o `Number.isFinite` abaixo.
 */
function numeroDoArgumento(bruto: string | undefined): number {
  const texto = bruto?.trim();
  return texto ? Number(texto) : Number.NaN;
}

export function leArgumentos(argv: string[]): Argumentos {
  const mapa = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--')) continue;
    mapa.set(argv[i].slice(2), argv[i + 1] ?? '');
  }

  const group = mapa.get('group');
  const price = numeroDoArgumento(mapa.get('price'));
  const cycleDay = numeroDoArgumento(mapa.get('cycle-day'));

  if (!group || !Number.isFinite(price) || !Number.isFinite(cycleDay)) {
    throw new Error(
      'uso: pnpm billing:dry-run --group <id> --price <centavos> --cycle-day <1..28> [--tier <faixa>] [--at <ISO>]',
    );
  }

  const at = mapa.get('at');
  return {
    group,
    price,
    cycleDay,
    tier: mapa.get('tier') ?? 'nao-informada',
    at: at ? new Date(at) : undefined,
  };
}

const emReais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function main(): Promise<void> {
  let args: Argumentos;
  try {
    args = leArgumentos(process.argv.slice(2));
  } catch (erro) {
    // Erro de uso é do operador, não do programa: a mensagem sozinha resolve, e
    // a pilha de chamadas só a esconde no meio de vinte linhas de `node:internal`.
    console.error(`\n${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();

  try {
    const fatura = await fecharCiclo(
      prisma as unknown as CicloDb,
      {
        groupId: args.group,
        tier: args.tier,
        pricePerStudentCents: args.price,
        cycleDay: args.cycleDay,
      },
      args.at,
    );

    console.log(`\nSIMULAÇÃO — nada foi gravado e nenhuma cobrança foi criada.\n`);
    console.log(`Grupo:    ${fatura.groupId}`);
    console.log(`Faixa:    ${fatura.tier}`);
    console.log(
      `Período:  ${fatura.periodStart.toISOString()} → ${fatura.periodEnd.toISOString()} (${fatura.periodDays} dias)`,
    );
    console.log(`Ativos:   ${fatura.activeCount}`);
    console.log(`Total:    ${emReais(fatura.totalCents)}\n`);

    for (const linha of fatura.lines) {
      console.log(
        `  ${linha.membershipId}  ${linha.displayName.padEnd(28)}  ${String(linha.proRataMilli).padStart(4)}‰  ${emReais(linha.amountCents).padStart(12)}`,
      );
    }
    console.log('');
  } catch (erro) {
    // `RangeError` aqui é sempre argumento fora de faixa (`--cycle-day 31`,
    // `--price 15.9`), que é erro do operador pelo mesmo motivo: mensagem, não
    // pilha.
    if (erro instanceof GrupoNaoFaturavelError || erro instanceof RangeError) {
      console.error(`\n${erro.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw erro;
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda quando o arquivo é o comando, nunca quando é importado. Sem a guarda,
// o spec de `leArgumentos` abriria uma conexão Prisma de verdade só por existir.
if (require.main === module) void main();

import { addDaysIso, dateInTz } from '../progress/helpers/date-tz';

/**
 * Preço dos assentos de comunidade (ADR 025): conta pura, sem banco nem
 * provedor, para a tabela de teste cobrir cada borda.
 *
 * Tudo em centavo inteiro. O Asaas recebe reais decimais, e essa conversão só
 * acontece no `asaas.provider.ts`.
 */

/** Fuso do provedor: o ciclo do Asaas vira o dia em São Paulo. */
export const FUSO_DO_PROVEDOR = 'America/Sao_Paulo';
/** Menor cobrança que o Asaas aceita (R$ 5,00). Abaixo disso não há boleto nem Pix. */
export const MINIMO_DO_PROVEDOR_CENTS = 500;
/** Teto de assentos por comunidade, contra erro de digitação de um zero a mais. */
export const ASSENTOS_MAX = 1000;

export function valorMensal(seats: number, unitCents: number): number {
  return seats * unitCents;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias entre dois `YYYY-MM-DD` (b − a). */
function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DIA_MS);
}

/** O mesmo dia um mês antes, preso ao último dia do mês (31/03 → 28 ou 29/02). */
export function mesAnterior(ymd: string): string {
  const [a, m, d] = ymd.split('-').map(Number);
  const ano = m === 1 ? a - 1 : a;
  const mes = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export interface ProRata {
  /** Valor proporcional dos assentos novos até o fim do período. */
  valorCents: number;
  /** Dias que faltam, contando hoje. */
  diasRestantes: number;
  diasNoPeriodo: number;
  /** `false` = abaixo do mínimo do provedor: os assentos valem, sem cobrança avulsa. */
  cobrar: boolean;
}

/**
 * Quanto custa aumentar de `de` para `para` assentos agora, até o fim do
 * período já pago (ADR 025: o aumento vale na hora e a diferença é cobrada
 * à parte; a recorrente passa ao valor novo na renovação).
 *
 * Os dias são dias locais do provedor. Hoje conta inteiro: quem aumenta às
 * 23h usa o assento naquele dia. O período vai do mesmo dia no mês anterior
 * até o vencimento (exclusive), que é como o Asaas renova uma mensal.
 */
export function proRataAumento(entrada: {
  de: number;
  para: number;
  unitCents: number;
  /** Fim do período pago (`GroupSeatPool.currentPeriodEnd`). */
  fimDoPeriodo: Date;
  agora: Date;
}): ProRata {
  const novos = Math.max(0, entrada.para - entrada.de);
  const fim = dateInTz(entrada.fimDoPeriodo, FUSO_DO_PROVEDOR);
  const inicio = mesAnterior(fim);
  const hoje = dateInTz(entrada.agora, FUSO_DO_PROVEDOR);
  const diasNoPeriodo = diasEntre(inicio, fim);
  const diasRestantes = Math.min(diasNoPeriodo, Math.max(0, diasEntre(hoje, fim)));
  const valorCents =
    diasNoPeriodo > 0 ? Math.round((novos * entrada.unitCents * diasRestantes) / diasNoPeriodo) : 0;
  return {
    valorCents,
    diasRestantes,
    diasNoPeriodo,
    cobrar: valorCents >= MINIMO_DO_PROVEDOR_CENTS,
  };
}

/** Vencimento da cobrança avulsa: amanhã no fuso do provedor (o Asaas não aceita data passada). */
export function vencimentoAvulso(agora: Date): string {
  return addDaysIso(dateInTz(agora, FUSO_DO_PROVEDOR), 1);
}

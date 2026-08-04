import { addDaysIso, dateInTz, dayBoundsInTz } from '../progress/helpers/date-tz';

/**
 * O calendário da cobrança (#158) — puro, sem Nest e sem Prisma.
 *
 * Tudo aqui é aritmética de dia **local**, nunca de UTC. Não é preciosismo: o
 * ciclo de uma academia em São Paulo fecha à meia-noite dela, e um fechamento em
 * UTC jogaria para fora da janela todo aluno que registrou entre 21h e a
 * meia-noite do último dia — três horas de atividade que existiram e que a
 * fatura diria não existir. Como o erro sempre cai para o mesmo lado (a Fatia
 * cobra a menos, o aluno "some"), ele nunca apareceria como discrepância óbvia.
 *
 * Ser função pura é o que permite testar 28, 30 e 31 dias, fevereiro e a virada
 * de ano sem banco e sem relógio de teste.
 */

/** Um dia local do ciclo. `end` é o `start` do dia seguinte, nunca `start + 24h`. */
export interface DiaDoCiclo {
  /** YYYY-MM-DD no fuso do ciclo. É o que a academia lê ao conferir a conta. */
  ymd: string;
  start: Date;
  end: Date;
}

export interface PeriodoDeCobranca {
  timezone: string;
  startYmd: string;
  endYmd: string;
  /** Meia-noite local do primeiro dia do ciclo. */
  start: Date;
  /** Meia-noite local do dia do fechamento. Exclusivo: o ciclo não o inclui. */
  end: Date;
  /** Os dias do ciclo, em ordem. `dias.length` é o denominador da pró-rata. */
  dias: DiaDoCiclo[];
}

/** Dias da janela de atividade que decide quem é aluno ativo. Ver `docs/BILLING.md`. */
export const JANELA_DE_ATIVIDADE_DIAS = 30;

/**
 * Maior dia do mês aceito como fechamento.
 *
 * 29, 30 e 31 não existem em todo mês: um ciclo em 31 pularia fevereiro inteiro
 * — e "pulou o mês" numa rotina de cobrança é o tipo de falha que ninguém nota
 * até a fatura não chegar.
 */
export const MAIOR_DIA_DE_FECHAMENTO = 28;

function ymdDe(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/**
 * O ciclo que **acabou de fechar** em `referencia`.
 *
 * Fechado e não corrente de propósito: fatura de período que ainda corre teria
 * de ser reemitida quando alguém entrasse no dia seguinte.
 */
export function periodoDeCobranca(
  cycleDay: number,
  timezone: string,
  referencia: Date,
): PeriodoDeCobranca {
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > MAIOR_DIA_DE_FECHAMENTO) {
    throw new RangeError(
      `cycleDay precisa ser inteiro entre 1 e ${MAIOR_DIA_DE_FECHAMENTO}; recebido: ${cycleDay}`,
    );
  }

  const [ano, mes, dia] = dateInTz(referencia, timezone).split('-').map(Number);

  // O fechamento é a última ocorrência do dia do ciclo que já passou. Se hoje
  // ainda não chegou nele, o fechamento foi no mês passado.
  const fechamento = dia >= cycleDay ? { ano, mes } : mesAnterior(ano, mes);
  const abertura = mesAnterior(fechamento.ano, fechamento.mes);

  const startYmd = ymdDe(abertura.ano, abertura.mes, cycleDay);
  const endYmd = ymdDe(fechamento.ano, fechamento.mes, cycleDay);

  const ymds: string[] = [];
  for (let d = startYmd; d < endYmd; d = addDaysIso(d, 1)) ymds.push(d);

  const inicios = ymds.map((y) => dayBoundsInTz(y, timezone).start);
  const fim = dayBoundsInTz(endYmd, timezone).start;

  return {
    timezone,
    startYmd,
    endYmd,
    start: inicios[0],
    end: fim,
    // O fim de cada dia é o início do seguinte, e não `start + 86.400.000`: em
    // fuso com horário de verão existe dia de 23 h e dia de 25 h, e somar 24 h
    // deixaria uma hora de fora (ou contaria duas vezes) exatamente na virada.
    dias: ymds.map((y, i) => ({ ymd: y, start: inicios[i], end: inicios[i + 1] ?? fim })),
  };
}

/**
 * A janela em que a atividade do aluno é procurada: os últimos
 * {@link JANELA_DE_ATIVIDADE_DIAS} dias locais terminando no fechamento.
 *
 * Ela não é o ciclo. Um ciclo de 31 dias tem um primeiro dia fora da janela, e
 * isso é a regra publicada — não um arredondamento.
 */
export function janelaDeAtividade(
  periodo: PeriodoDeCobranca,
  dias: number = JANELA_DE_ATIVIDADE_DIAS,
): { start: Date; end: Date } {
  const desde = addDaysIso(periodo.endYmd, -dias);
  return { start: dayBoundsInTz(desde, periodo.timezone).start, end: periodo.end };
}

/**
 * Dias do ciclo em que a associação esteve de pé.
 *
 * Conta o dia inteiro se a associação existiu em **qualquer** momento dele. É a
 * regra mais simples de a academia conferir sozinha ("entrou dia 10, pagou 21 de
 * 31") e a única que não depende do horário em que o aluno apertou o botão.
 */
export function diasAtivos(
  periodo: PeriodoDeCobranca,
  membresia: { joinedAt: Date | null; leftAt: Date | null },
): number {
  if (!membresia.joinedAt) return 0;
  const { joinedAt, leftAt } = membresia;

  return periodo.dias.filter((dia) => joinedAt < dia.end && (leftAt === null || leftAt > dia.start))
    .length;
}

/**
 * Fração do ciclo, em milésimos.
 *
 * Milésimo inteiro e não fração decimal: dinheiro derivado de `0.1 + 0.2` erra
 * na soma de N linhas, e aqui N é o número de alunos da academia.
 */
export function proRataMilli(
  periodo: PeriodoDeCobranca,
  membresia: { joinedAt: Date | null; leftAt: Date | null },
): number {
  return Math.round((diasAtivos(periodo, membresia) / periodo.dias.length) * 1000);
}

/** Valor de uma linha da fatura, em centavos. */
export function valorDaLinhaCents(pricePerStudentCents: number, proRata: number): number {
  return Math.round((pricePerStudentCents * proRata) / 1000);
}

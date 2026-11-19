/**
 * Dia útil no Brasil (#400): segunda a sexta, fora os feriados nacionais.
 * Função pura, sem fuso: recebe e devolve datas `YYYY-MM-DD` já no fuso da
 * comunidade.
 */

export function brazilNationalHolidays(_year: number): Set<string> {
  throw new Error('não implementado');
}

export function isBusinessDay(_ymd: string): boolean {
  throw new Error('não implementado');
}

/** O 1º dia útil do mês `YYYY-MM`. */
export function firstBusinessDay(_month: string): string {
  throw new Error('não implementado');
}

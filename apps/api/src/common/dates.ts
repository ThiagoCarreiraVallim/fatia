import { BadRequestException } from '@nestjs/common';

/**
 * Datas que chegam como texto, validadas no service — a porta que vale para o
 * REST e para o MCP ao mesmo tempo.
 *
 * O DTO do REST já recusava data inválida (`@IsDateString`), mas a tool MCP
 * declara `z.string()`: "ontem" ou "2026-13-40" chegavam ao `new Date()`, viravam
 * `Invalid Date` e estouravam no Prisma como erro INTERNAL, sem nenhuma pista
 * para o modelo corrigir. Aqui o erro sai como 400 (`INVALID_INPUT` no MCP), com
 * o formato esperado e um exemplo.
 */

/** Um instante em ISO 8601 (`eatenAt` e afins). */
export function parseInstant(value: string, field: string): Date {
  const date = new Date(value);
  if (!ISO_INSTANT.test(value.trim()) || Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      `${field} não é uma data válida ("${clip(value)}"). Use ISO 8601 com o fuso, ` +
        'ex.: 2026-07-29T12:30:00-03:00.',
    );
  }
  return date;
}

/**
 * Um dia do calendário, `YYYY-MM-DD`. Recusa também o dia que não existe
 * (`2026-02-31`): `Date.UTC` o empurraria em silêncio para 3 de março, e a
 * resposta seria de outro dia.
 */
export function assertDay(value: string, field: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const valid =
    match !== null &&
    (() => {
      const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
      const date = new Date(Date.UTC(y, m - 1, d));
      return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    })();
  if (!valid) {
    throw new BadRequestException(
      `${field} não é um dia válido ("${clip(value)}"). Use YYYY-MM-DD, ex.: 2026-07-29.`,
    );
  }
  return value;
}

/**
 * Data, e opcionalmente hora, no formato ISO 8601. `new Date()` sozinho aceita
 * coisa demais ("July 29", "1") e devolve um instante de fuso indefinido.
 */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** O valor recusado volta na mensagem, cortado: é input do cliente, não log. */
function clip(value: string): string {
  return value.length > 40 ? `${value.slice(0, 40)}…` : value;
}

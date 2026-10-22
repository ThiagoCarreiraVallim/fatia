import { BadRequestException } from '@nestjs/common';
import { categorizeError } from '../../mcp/mcp-error';
import { assertDay, parseInstant } from '../dates';

describe('parseInstant', () => {
  it.each([
    '2026-07-29T12:30:00-03:00',
    '2026-07-29T12:30:00Z',
    '2026-07-29T12:30:00.123Z',
    '2026-07-29T12:30-0300',
    '2026-07-29',
  ])('aceita %s', (valor) => {
    expect(parseInstant(valor, 'eatenAt').getTime()).toBe(new Date(valor).getTime());
  });

  it.each(['ontem', '', '2026-13-40T12:00:00Z', 'July 29 2026', '1', '2026-07-29T25:00:00Z'])(
    'recusa %p com 400 e o formato esperado',
    (valor) => {
      const erro = (() => {
        try {
          parseInstant(valor, 'eatenAt');
        } catch (e) {
          return e;
        }
      })();
      expect(erro).toBeInstanceOf(BadRequestException);
      expect((erro as Error).message).toMatch(/eatenAt.*ISO 8601.*2026-07-29T12:30:00-03:00/);
    },
  );

  it('no MCP vira INVALID_INPUT, e não INTERNAL', () => {
    const erro = (() => {
      try {
        parseInstant('ontem', 'eatenAt');
      } catch (e) {
        return e;
      }
    })();
    expect(categorizeError(erro)).toMatchObject({ category: 'INVALID_INPUT' });
  });
});

describe('assertDay', () => {
  it('aceita um dia do calendário', () => {
    expect(assertDay('2026-02-28', 'date')).toBe('2026-02-28');
    expect(assertDay('2028-02-29', 'date')).toBe('2028-02-29');
  });

  it.each(['2026-02-31', '2026-02-29', '2026-13-01', '29/07/2026', 'hoje', '2026-7-1'])(
    'recusa %p — inclusive o dia que não existe',
    (valor) => {
      expect(() => assertDay(valor, 'date')).toThrow(/date não é um dia válido.*YYYY-MM-DD/);
    },
  );
});

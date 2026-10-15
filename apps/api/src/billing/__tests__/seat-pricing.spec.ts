import { mesAnterior, proRataAumento, valorMensal, vencimentoAvulso } from '../seat-pricing';

/** Meia-noite em São Paulo (UTC−3) de um dia. */
const sp = (ymd: string, hora = '00:00') => new Date(`${ymd}T${hora}:00-03:00`);

describe('seat-pricing', () => {
  it('valor mensal é assentos × preço unitário', () => {
    expect(valorMensal(0, 1490)).toBe(0);
    expect(valorMensal(1, 1490)).toBe(1490);
    expect(valorMensal(12, 1490)).toBe(17880);
  });

  it.each([
    ['2026-03-31', '2026-02-28'],
    ['2028-03-31', '2028-02-29'],
    ['2026-01-15', '2025-12-15'],
    ['2026-10-15', '2026-09-15'],
  ])('mês anterior de %s é %s', (ymd, esperado) => {
    expect(mesAnterior(ymd)).toBe(esperado);
  });

  it.each([
    // [descrição, de, para, fim do período, agora, valor, restantes, período, cobrar]
    ['metade do mês, 2 novos', 5, 7, '2026-11-15', sp('2026-10-31', '10:00'), 1442, 15, 31, true],
    [
      'último dia, 1 novo: abaixo do mínimo',
      5,
      6,
      '2026-11-15',
      sp('2026-11-14', '23:00'),
      48,
      1,
      31,
      false,
    ],
    [
      'primeiro dia do período cobra o mês inteiro',
      1,
      3,
      '2026-11-15',
      sp('2026-10-15', '08:00'),
      2980,
      31,
      31,
      true,
    ],
    ['redução não cobra nada', 5, 3, '2026-11-15', sp('2026-10-31'), 0, 15, 31, false],
    ['período já vencido não cobra', 5, 7, '2026-11-15', sp('2026-11-20'), 0, 0, 31, false],
    ['fevereiro tem 28 dias', 0, 10, '2026-03-10', sp('2026-02-24'), 7450, 14, 28, true],
  ])('%s', (_d, de, para, fim, agora, valor, restantes, periodo, cobrar) => {
    expect(proRataAumento({ de, para, unitCents: 1490, fimDoPeriodo: sp(fim), agora })).toEqual({
      valorCents: valor,
      diasRestantes: restantes,
      diasNoPeriodo: periodo,
      cobrar,
    });
  });

  it('dia local do provedor, não o UTC: 23h em São Paulo ainda é hoje', () => {
    // 02:00 UTC de 01/11 = 23:00 de 31/10 em São Paulo.
    const r = proRataAumento({
      de: 0,
      para: 1,
      unitCents: 3100,
      fimDoPeriodo: sp('2026-11-15'),
      agora: new Date('2026-11-01T02:00:00Z'),
    });
    expect(r.diasRestantes).toBe(15);
  });

  it('a cobrança avulsa vence amanhã no fuso do provedor', () => {
    expect(vencimentoAvulso(new Date('2026-11-01T02:00:00Z'))).toBe('2026-11-01');
    expect(vencimentoAvulso(sp('2026-12-31', '12:00'))).toBe('2027-01-01');
  });
});

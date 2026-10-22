import { sameLocalTimeOn } from '../helpers/date-tz';

describe('sameLocalTimeOn', () => {
  it('leva o horário local para outro dia, no fuso da pessoa', () => {
    // 12:30 em São Paulo (UTC-3) = 15:30Z.
    const almoco = new Date('2026-10-13T15:30:00Z');
    expect(sameLocalTimeOn(almoco, '2026-10-14', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-14T15:30:00.000Z',
    );
  });

  it('refeição tarde da noite não escorrega para o dia seguinte em UTC', () => {
    // 23:00 em São Paulo do dia 13 = 02:00Z do dia 14.
    const ceia = new Date('2026-10-14T02:00:00Z');
    expect(sameLocalTimeOn(ceia, '2026-10-20', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-21T02:00:00.000Z',
    );
  });

  it('fuso à frente de UTC', () => {
    // 07:15 em Tóquio (UTC+9) do dia 14 = 22:15Z do dia 13.
    const cafe = new Date('2026-10-13T22:15:00Z');
    expect(sameLocalTimeOn(cafe, '2026-10-01', 'Asia/Tokyo').toISOString()).toBe(
      '2026-09-30T22:15:00.000Z',
    );
  });

  it('atravessando o horário de verão mantém o relógio de parede', () => {
    // Nova York: 12:00 em julho (UTC-4) copiado para dezembro (UTC-5) continua 12:00.
    const julho = new Date('2026-07-10T16:00:00Z');
    expect(sameLocalTimeOn(julho, '2026-12-10', 'America/New_York').toISOString()).toBe(
      '2026-12-10T17:00:00.000Z',
    );
  });
});

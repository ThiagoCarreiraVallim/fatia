import { describe, expect, it } from 'vitest';
import { alvoMedio, formatarVolume, horaDoDia, percentualDaMeta, saudacao } from '../helpers';

describe('saudacao', () => {
  it('cobre as quatro faixas do dia', () => {
    expect(saudacao(new Date(2026, 6, 29, 3))).toBe('Boa madrugada');
    expect(saudacao(new Date(2026, 6, 29, 9))).toBe('Bom dia');
    expect(saudacao(new Date(2026, 6, 29, 15))).toBe('Boa tarde');
    expect(saudacao(new Date(2026, 6, 29, 21))).toBe('Boa noite');
  });

  it('troca de faixa exatamente na virada da hora', () => {
    expect(saudacao(new Date(2026, 6, 29, 5, 59))).toBe('Boa madrugada');
    expect(saudacao(new Date(2026, 6, 29, 6, 0))).toBe('Bom dia');
    expect(saudacao(new Date(2026, 6, 29, 11, 59))).toBe('Bom dia');
    expect(saudacao(new Date(2026, 6, 29, 12, 0))).toBe('Boa tarde');
    expect(saudacao(new Date(2026, 6, 29, 18, 0))).toBe('Boa noite');
  });
});

describe('percentualDaMeta', () => {
  it('devolve a fração arredondada', () => {
    expect(percentualDaMeta(2500, 10_000)).toBe(25);
    expect(percentualDaMeta(1, 3)).toBe(33);
  });

  it('trava em 100 quando a meta é ultrapassada', () => {
    expect(percentualDaMeta(15_000, 10_000)).toBe(100);
  });

  it('devolve null sem meta utilizável, para o card esconder a barra', () => {
    expect(percentualDaMeta(500, null)).toBeNull();
    expect(percentualDaMeta(500, 0)).toBeNull();
    expect(percentualDaMeta(500, -1)).toBeNull();
  });

  it('não deixa valor negativo virar barra invertida', () => {
    expect(percentualDaMeta(-100, 2000)).toBe(0);
  });
});

describe('formatarVolume', () => {
  it('usa mL abaixo de um litro', () => {
    expect(formatarVolume(0)).toBe('0 mL');
    expect(formatarVolume(350)).toBe('350 mL');
    expect(formatarVolume(999)).toBe('999 mL');
  });

  it('vira litro com vírgula decimal a partir de mil', () => {
    expect(formatarVolume(1000)).toBe('1,0 L');
    expect(formatarVolume(2450)).toBe('2,5 L');
  });
});

describe('alvoMedio', () => {
  it('devolve o ponto médio inteiro da faixa', () => {
    expect(alvoMedio(1800, 2200)).toBe(2000);
    expect(alvoMedio(120, 141)).toBe(131);
  });
});

describe('horaDoDia', () => {
  it('formata em 24 horas', () => {
    expect(horaDoDia(new Date(2026, 6, 29, 7, 5).toISOString())).toBe('07:05');
    expect(horaDoDia(new Date(2026, 6, 29, 19, 42).toISOString())).toBe('19:42');
  });

  it('não quebra com data inválida vinda da API', () => {
    expect(horaDoDia('sem-data')).toBe('—');
  });
});

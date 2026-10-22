import { describe, expect, it } from 'vitest';
import { alvoMedio, horaDoDia, percentualDaMeta } from '../helpers';

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

import { describe, expect, it } from 'vitest';
import { legendaDeTolerancia, rotuloDeSequencia } from '../streak-copy';
import type { StreakResult } from '../progress';

const base: StreakResult = {
  periodos: 0,
  faltasUsadas: 0,
  faltasPermitidas: 0,
  periodoCorrenteEmAberto: false,
  janelaEsgotada: false,
};

const streak = (parcial: Partial<StreakResult>): StreakResult => ({ ...base, ...parcial });

describe('rotuloDeSequencia', () => {
  it('concorda em número', () => {
    expect(rotuloDeSequencia(streak({ periodos: 1 }), 'dias')).toBe('1 dia');
    expect(rotuloDeSequencia(streak({ periodos: 12 }), 'dias')).toBe('12 dias');
    expect(rotuloDeSequencia(streak({ periodos: 1 }), 'semanas')).toBe('1 semana');
    expect(rotuloDeSequencia(streak({ periodos: 3 }), 'semanas')).toBe('3 semanas');
  });

  it('marca com + quando a sequência encosta no teto da janela', () => {
    // Sem o `+`, quem passa de um ano fica travado no mesmo número para sempre e conclui que o
    // app parou de contar.
    expect(rotuloDeSequencia(streak({ periodos: 365, janelaEsgotada: true }), 'dias')).toBe(
      '365+ dias',
    );
  });

  it('não marca com + quando a sequência cabe na janela', () => {
    expect(rotuloDeSequencia(streak({ periodos: 365 }), 'dias')).toBe('365 dias');
  });
});

describe('legendaDeTolerancia', () => {
  it('conta a falta usada em vez de deixar o número parecer arbitrário', () => {
    // O critério de pronto nº 1 da issue: com D-0, D-2 e D-3 o número é 4 e o card diz por quê.
    expect(
      legendaDeTolerancia(streak({ periodos: 4, faltasUsadas: 1, faltasPermitidas: 2 }), 'dias'),
    ).toBe('1 de 2 faltas usadas — a sequência segue.');
  });

  it('concorda em número no plural das faltas', () => {
    expect(
      legendaDeTolerancia(streak({ periodos: 11, faltasUsadas: 2, faltasPermitidas: 2 }), 'dias'),
    ).toBe('2 de 2 faltas usadas — a sequência segue.');
  });

  it('diz que o dia ainda não acabou em vez de cobrar registro', () => {
    const texto = legendaDeTolerancia(
      streak({ periodos: 5, periodoCorrenteEmAberto: true }),
      'dias',
    );

    expect(texto).toBe('Hoje ainda está em aberto — o dia não acabou.');
  });

  it('a falta usada tem prioridade sobre o dia em aberto', () => {
    // As duas condições coexistem o tempo todo. Mostrar "hoje está em aberto" e esconder a falta
    // deixaria o número sem explicação, que é o caso que mais confunde.
    const texto = legendaDeTolerancia(
      streak({ periodos: 6, faltasUsadas: 1, faltasPermitidas: 1, periodoCorrenteEmAberto: true }),
      'dias',
    );

    expect(texto).toBe('1 de 1 falta usada — a sequência segue.');
  });

  it('convida a começar quando não há sequência', () => {
    expect(legendaDeTolerancia(streak({}), 'dias')).toBe(
      'Registre uma refeição, um treino ou seus passos para começar.',
    );
    expect(legendaDeTolerancia(streak({}), 'semanas')).toBe(
      'Conclua um treino nesta semana para começar.',
    );
  });

  it('cala a boca quando não há nada honesto a dizer', () => {
    expect(legendaDeTolerancia(streak({ periodos: 9, faltasPermitidas: 2 }), 'dias')).toBeNull();
  });
});

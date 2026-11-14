import { describe, expect, it } from 'vitest';
import { screenBottomPadding } from '../bottom-space';

/**
 * O respiro embaixo das telas (#369): a barra flutua 22 px acima da área
 * segura e tem 68; com a barra "treino em andamento", mais 56 + 10. Sem isso o
 * último item da tela fica atrás das barras.
 */
describe('screenBottomPadding', () => {
  it('com a barra de baixo: área segura + 22 + 68 + respiro de 16', () => {
    expect(screenBottomPadding({ safeBottom: 0, navVisible: true, workoutBar: false })).toBe(106);
    expect(screenBottomPadding({ safeBottom: 34, navVisible: true, workoutBar: false })).toBe(140);
  });

  it('com o treino em andamento, soma a barra dele (56) e o vão (10)', () => {
    expect(screenBottomPadding({ safeBottom: 0, navVisible: true, workoutBar: true })).toBe(172);
  });

  it('em tarefa de foco (sem barra), só a área segura e o respiro', () => {
    expect(screenBottomPadding({ safeBottom: 20, navVisible: false, workoutBar: true })).toBe(36);
  });
});

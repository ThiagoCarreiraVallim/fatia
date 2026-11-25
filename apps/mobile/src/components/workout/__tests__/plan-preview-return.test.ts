import { describe, expect, it } from 'vitest';
import { previewAfterNavigation, type PreviewRequest } from '../plan-preview-return';

/**
 * Tocar num exercício da prévia (#484) abre o "Como fazer", que é uma tela; a
 * folha sai da frente e volta quando a pessoa volta para a tela de onde abriu.
 */
const away: PreviewRequest = {
  planId: 'p1',
  away: { from: '/workout/plans', to: '/workout/exercise/7', arrived: false },
};

describe('prévia que sai para o "Como fazer" e volta', () => {
  it('antes de a navegação acontecer, continua esperando', () => {
    expect(previewAfterNavigation(away, '/workout/plans')).toBe(away);
  });

  it('chegou no "Como fazer": marca que saiu', () => {
    expect(previewAfterNavigation(away, '/workout/exercise/7')).toEqual({
      planId: 'p1',
      away: { ...away.away, arrived: true },
    });
  });

  it('voltou para a tela de origem: a prévia reabre', () => {
    const there = previewAfterNavigation(away, '/workout/exercise/7');
    expect(previewAfterNavigation(there, '/workout/plans')).toEqual({ planId: 'p1' });
  });

  it('foi para outro lugar a partir do "Como fazer": a prévia é esquecida', () => {
    const there = previewAfterNavigation(away, '/workout/exercise/7');
    expect(previewAfterNavigation(there, '/today')).toBeNull();
  });

  it('prévia aberta (sem saída pendente): navegar não muda nada', () => {
    const open: PreviewRequest = { planId: 'p1' };
    expect(previewAfterNavigation(open, '/workout/agenda')).toBe(open);
    expect(previewAfterNavigation(null, '/workout/agenda')).toBeNull();
  });
});

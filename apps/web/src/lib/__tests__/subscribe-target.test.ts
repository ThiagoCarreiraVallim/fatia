import { describe, expect, it } from 'vitest';
import { subscribeTarget } from '../subscribe-target';

/**
 * O "Assinar PRO" do site (Si-04, #386): o site não tem sessão, então manda
 * para `/assinar`, que leva ao Meu plano com o período e a forma de pagamento
 * — passando pelo login quando preciso, sem perder a escolha.
 */
describe('subscribeTarget', () => {
  it('com sessão, vai direto ao Meu plano com a escolha', () => {
    expect(subscribeTarget({ periodo: 'MONTHLY', pagamento: 'BOLETO' }, true)).toBe(
      '/plan?periodo=MONTHLY&pagamento=BOLETO',
    );
  });

  it('sem sessão, passa pelo login e volta ao Meu plano', () => {
    expect(subscribeTarget({ periodo: 'YEARLY', pagamento: 'PIX' }, false)).toBe(
      `/login?next=${encodeURIComponent('/plan?periodo=YEARLY&pagamento=PIX')}`,
    );
  });

  it('valor fora da lista é descartado (a URL é de fora)', () => {
    expect(subscribeTarget({ periodo: 'SEMANAL', pagamento: 'javascript:x' }, true)).toBe('/plan');
    expect(subscribeTarget({ periodo: ['YEARLY', 'MONTHLY'] }, true)).toBe('/plan');
  });
});

import { describe, expect, it } from 'vitest';
import { mobilePushTarget } from '../push-target';

describe('toque no aviso no app (#399, F6)', () => {
  it('o aviso diário do em risco cai no painel da comunidade, que existe no app', () => {
    expect(mobilePushTarget({ url: '/org/g1/review/at-risk' })).toBe('/org/g1');
    expect(mobilePushTarget({ url: '/org/g1/review/sessions/s1' })).toBe('/org/g1');
    expect(mobilePushTarget({ url: '/org/g1/review' })).toBe('/org/g1');
    // Ativação pendente (#401) também não tem tela no app ainda.
    expect(mobilePushTarget({ url: '/org/g1/activation' })).toBe('/org/g1');
    expect(mobilePushTarget({ url: '/org/g1/members' })).toBe('/org/g1/members');
  });

  it('o resto passa como o `notificationTarget` decide', () => {
    expect(mobilePushTarget({ url: '/workout/history/s1' })).toBe('/workout/history/s1');
    expect(mobilePushTarget({ url: '/org/g1/review?aba=risco' })).toBeNull();
    expect(mobilePushTarget({ url: 'https://exemplo.com' })).toBeNull();
  });
});

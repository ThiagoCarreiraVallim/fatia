import { communityName, DISPLAY_NAME_MAX } from '../display-name';

/**
 * O nome de alguém na comunidade sai de um lugar só: o apelido escolhido para
 * aquela comunidade, senão o apelido do perfil, senão o primeiro nome da conta.
 */
describe('communityName', () => {
  const user = (nickname: string | null, name = 'Ana Paula Lima') => ({ nickname, name });

  it('usa o apelido da comunidade quando existe', () => {
    expect(communityName({ displayName: 'Aninha', user: user('Ana P') })).toBe('Aninha');
  });

  it('sem apelido na comunidade, usa o apelido do perfil', () => {
    expect(communityName({ displayName: null, user: user('Ana P') })).toBe('Ana P');
  });

  it('sem apelido nenhum, usa o primeiro nome da conta', () => {
    expect(communityName({ displayName: null, user: user(null) })).toBe('Ana');
  });

  it('apelido do perfil vazio conta como ausente', () => {
    expect(communityName({ displayName: null, user: user('   ') })).toBe('Ana');
  });

  it('corta no tamanho do apelido da comunidade e junta espaços', () => {
    const longo = `${'x'.repeat(40)}`;
    expect(communityName({ displayName: null, user: user(longo) })).toHaveLength(DISPLAY_NAME_MAX);
    expect(communityName({ displayName: null, user: user('  Ana   P ') })).toBe('Ana P');
  });
});

import { isProvisionalName } from '../provisional-name';

/** Nome que ninguém escolheu: o que o provisionamento inventa sem perfil. */
describe('isProvisionalName', () => {
  const base = { email: 'ana@x.com', logtoSub: 'sub-1' };

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['"User"', 'User'],
    ['o sub', 'sub-1'],
    ['o pedaço do e-mail antes do @', 'ana'],
  ])('%s é provisório', (_, name) => {
    expect(isProvisionalName({ ...base, name })).toBe(true);
  });

  it('o e-mail placeholder do Logto: o nome é o sub', () => {
    expect(isProvisionalName({ name: 'k3j9', email: 'k3j9@logto.local', logtoSub: 'k3j9' })).toBe(
      true,
    );
  });

  it('um nome de verdade não é', () => {
    expect(isProvisionalName({ ...base, name: 'Ana Souza' })).toBe(false);
  });

  it('o nome digitado que só coincide com o e-mail (outra caixa) é de verdade', () => {
    expect(isProvisionalName({ ...base, name: 'Ana' })).toBe(false);
  });
});

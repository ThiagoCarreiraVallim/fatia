import { describe, expect, it } from 'vitest';
import { cleanSignupName, signInExtraParams } from '../sign-in-params';

describe('parâmetros do login (Onb-01a/01b)', () => {
  it('sempre leva o resource da API; a tela, o e-mail e o conector só quando vierem', () => {
    expect(signInExtraParams('https://api', {})).toEqual({ resource: 'https://api' });
    expect(
      signInExtraParams('https://api', { firstScreen: 'register', loginHint: ' ana@email.com ' }),
    ).toEqual({
      resource: 'https://api',
      first_screen: 'register',
      login_hint: 'ana@email.com',
      prompt: 'login consent',
    });
  });

  it('criar conta ou entrar com e-mail ignora a sessão aberta no navegador', () => {
    // Sem `prompt=login` o Logto reaproveita a sessão do Custom Tab e "Criar
    // conta" entrava direto na conta que já estava lá.
    expect(signInExtraParams('https://api', { firstScreen: 'register' }).prompt).toBe(
      'login consent',
    );
    expect(signInExtraParams('https://api', { loginHint: 'bia@email.com' }).prompt).toBe(
      'login consent',
    );
    // Google/Apple e o "Entrar" sem e-mail seguem reaproveitando a sessão.
    expect(signInExtraParams('https://api', { social: 'google' })).not.toHaveProperty('prompt');
    expect(signInExtraParams('https://api', {})).not.toHaveProperty('prompt');
  });

  it('Google e Apple vão direto ao conector social', () => {
    expect(signInExtraParams('https://api', { social: 'apple' })).toEqual({
      resource: 'https://api',
      direct_sign_in: 'social:apple',
    });
  });

  it('e-mail que não parece e-mail não vira login_hint', () => {
    expect(signInExtraParams('https://api', { loginHint: 'sem-arroba' })).toEqual({
      resource: 'https://api',
    });
  });

  it('o nome da conta nova: sem espaço sobrando, até 80 caracteres', () => {
    expect(cleanSignupName('  Ana   Demo ')).toBe('Ana Demo');
    expect(cleanSignupName('   ')).toBeNull();
    expect(cleanSignupName('a'.repeat(90))).toHaveLength(80);
  });
});

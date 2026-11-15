import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME_PREFERENCE, parseThemePreference, resolveTheme } from '../theme';

describe('preferência de tema', () => {
  it('Sistema é o padrão', () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
  });

  it.each([undefined, null, '', 'auto', 'DARK', 42, {}])(
    'valor inválido (%s) cai em Sistema',
    (v) => {
      expect(parseThemePreference(v)).toBe('system');
    },
  );

  it.each(['system', 'dark', 'light'] as const)('aceita %s', (v) => {
    expect(parseThemePreference(v)).toBe(v);
  });
});

describe('resolveTheme', () => {
  it('Sistema segue o que o sistema pede', () => {
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('system', 'dark')).toBe('dark');
  });

  it('Sistema sem resposta do sistema fica no escuro (o tema de sempre)', () => {
    expect(resolveTheme('system', null)).toBe('dark');
    expect(resolveTheme('system', undefined)).toBe('dark');
  });

  it('escolha manual vence o sistema', () => {
    expect(resolveTheme('dark', 'light')).toBe('dark');
    expect(resolveTheme('light', 'dark')).toBe('light');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@fatia/design';
import {
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
} from '../theme-preference';
import { THEME_SCRIPT } from '../theme-script';

function mockSystem(scheme: 'light' | 'dark') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: q.includes(scheme),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-preference');
});

describe('preferência de tema na web', () => {
  it('sem nada guardado é Sistema', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('guarda e lê a escolha', () => {
    writeThemePreference('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemePreference()).toBe('light');
  });

  it('valor corrompido cai em Sistema', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'roxo');
    expect(readThemePreference()).toBe('system');
  });

  it('localStorage quebrado (aba privada, bloqueado) não derruba a página', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readThemePreference()).toBe('system');
    expect(() => writeThemePreference('dark')).not.toThrow();
  });

  it('aplica o tema resolvido no <html>: Sistema segue o sistema', () => {
    mockSystem('light');
    expect(applyThemePreference('system')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePreference).toBe('system');
  });

  it('escolha manual vence o sistema', () => {
    mockSystem('light');
    expect(applyThemePreference('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('script do <head>', () => {
  it('aplica a preferência guardada antes da pintura, sem depender do React', () => {
    mockSystem('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    new Function(THEME_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('não quebra com localStorage bloqueado: cai no sistema', () => {
    mockSystem('light');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => new Function(THEME_SCRIPT)()).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

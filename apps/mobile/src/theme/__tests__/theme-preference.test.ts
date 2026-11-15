import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const secure = {
  getItemAsync: vi.fn(async (k: string) => store.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    store.set(k, v);
  }),
};
vi.mock('expo-secure-store', () => secure);

const { readThemePreference, writeThemePreference } = await import('../theme-preference');

beforeEach(() => {
  store.clear();
});

describe('preferência de tema no app (SecureStore)', () => {
  it('sem nada guardado é Sistema', async () => {
    expect(await readThemePreference()).toBe('system');
  });

  it('guarda e lê a escolha', async () => {
    await writeThemePreference('light');
    expect(store.get('fatia.theme')).toBe('light');
    expect(await readThemePreference()).toBe('light');
  });

  it('valor corrompido cai em Sistema', async () => {
    store.set('fatia.theme', 'sépia');
    expect(await readThemePreference()).toBe('system');
  });

  it('SecureStore falhando não derruba a abertura do app', async () => {
    secure.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    expect(await readThemePreference()).toBe('system');
    secure.setItemAsync.mockRejectedValueOnce(new Error('keychain locked'));
    await expect(writeThemePreference('dark')).resolves.toBeUndefined();
  });
});

import * as SecureStore from 'expo-secure-store';
import { THEME_STORAGE_KEY, parseThemePreference, type ThemePreference } from '@fatia/design';

/**
 * Preferência de tema no app (ADR 041): Sistema, Escuro ou Claro, guardada no
 * aparelho. O SecureStore já está no projeto (sessão, convite pendente) e
 * evita uma dependência nova só para guardar uma palavra.
 *
 * Falhar ao ler (chaveiro bloqueado no primeiro boot do iOS, por exemplo) não
 * pode impedir o app de abrir: cai em "Sistema".
 */
export async function readThemePreference(): Promise<ThemePreference> {
  try {
    return parseThemePreference(await SecureStore.getItemAsync(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_STORAGE_KEY, preference);
  } catch {
    // Sem armazenamento a escolha vale até o app fechar.
  }
}

import * as SecureStore from 'expo-secure-store';
import { cleanSignupName } from './sign-in-params';

/**
 * O nome digitado em "Criar conta" (Onb-01a/01b). O login vai ao navegador do
 * sistema e o app pode ser fechado no meio; o onboarding lê, grava no perfil e
 * apaga. Mesmo cofre do convite pendente.
 */
const KEY = 'fatia.pendingName';

export async function savePendingName(raw: string): Promise<void> {
  const name = cleanSignupName(raw);
  if (name) await SecureStore.setItemAsync(KEY, name);
  else await SecureStore.deleteItemAsync(KEY);
}

/** Lê e apaga. */
export async function takePendingName(): Promise<string | null> {
  const name = await SecureStore.getItemAsync(KEY);
  if (name !== null) await SecureStore.deleteItemAsync(KEY);
  return cleanSignupName(name);
}

import * as SecureStore from 'expo-secure-store';
import { isInviteToken } from './invite-link';

/**
 * O convite que a pessoa abriu antes de entrar na conta. O login abre o
 * navegador do sistema e o app pode ser fechado no meio; sem guardar o token,
 * quem tocou no link de convite terminaria o cadastro no Início, sem convite.
 *
 * No cofre e não em `AsyncStorage` pelo mesmo motivo dos tokens de sessão: o
 * token do convite é o segredo que dá entrada na comunidade.
 */
const KEY = 'fatia.pendingInvite';

export async function savePendingInvite(token: string): Promise<void> {
  if (!isInviteToken(token)) return;
  await SecureStore.setItemAsync(KEY, token);
}

/** Lê e apaga: o convite pendente é retomado uma vez só. */
export async function takePendingInvite(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(KEY);
  if (token !== null) await SecureStore.deleteItemAsync(KEY);
  return isInviteToken(token) ? token : null;
}

export async function clearPendingInvite(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

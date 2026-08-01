import * as SecureStore from 'expo-secure-store';

/**
 * Armazenamento dos tokens no cofre do sistema — Keychain no iOS, Keystore no
 * Android.
 *
 * `AsyncStorage` está fora de questão: é texto plano no sandbox do app, legível
 * por qualquer processo com acesso ao sistema de arquivos num aparelho com root
 * ou jailbreak, e incluído em backups. É a diferença central entre o modelo de
 * ameaça do PWA (token vive no servidor, dentro de um cookie httpOnly) e o do
 * app nativo (token vive no aparelho). Ver docs/THREAT_MODEL.md.
 *
 * Cada token é uma entrada própria e não um JSON único porque o SecureStore
 * avisa acima de 2048 bytes por valor: um access token com claims de resource
 * mais o ID token no mesmo blob passa perto demais desse limite.
 */

const KEYS = {
  accessToken: 'fatia.accessToken',
  refreshToken: 'fatia.refreshToken',
  idToken: 'fatia.idToken',
  expiresAt: 'fatia.expiresAt',
} as const;

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  /** Epoch em ms de quando o access token expira. */
  expiresAt: number;
}

/**
 * Opções do SecureStore.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` é deliberado: o token não sai deste aparelho
 * nem via backup do iCloud, e não é lido com a tela bloqueada. Um token de saúde
 * restaurado num aparelho novo a partir de backup é uma sessão que o dono não
 * sabe que existe.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface TokenStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export const secureTokenStore: TokenStore = {
  async read() {
    const [accessToken, refreshToken, idToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken, OPTIONS),
      SecureStore.getItemAsync(KEYS.refreshToken, OPTIONS),
      SecureStore.getItemAsync(KEYS.idToken, OPTIONS),
      SecureStore.getItemAsync(KEYS.expiresAt, OPTIONS),
    ]);
    if (!accessToken || !expiresAt) return null;
    return {
      accessToken,
      refreshToken,
      idToken,
      expiresAt: Number(expiresAt),
    };
  },

  async write(session) {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, session.accessToken, OPTIONS),
      SecureStore.setItemAsync(KEYS.expiresAt, String(session.expiresAt), OPTIONS),
      session.refreshToken
        ? SecureStore.setItemAsync(KEYS.refreshToken, session.refreshToken, OPTIONS)
        : SecureStore.deleteItemAsync(KEYS.refreshToken, OPTIONS),
      session.idToken
        ? SecureStore.setItemAsync(KEYS.idToken, session.idToken, OPTIONS)
        : SecureStore.deleteItemAsync(KEYS.idToken, OPTIONS),
    ]);
  },

  async clear() {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key, OPTIONS)));
  },
};

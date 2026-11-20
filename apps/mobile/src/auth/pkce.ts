/**
 * PKCE (RFC 7636) do login dentro do app (ADR 050). O código e a entropia vêm
 * de fora (`expo-crypto` no app, `node:crypto` no teste), para isto ser puro.
 */

export function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 à mão: o `btoa` só aceita string "binária" e o Hermes antigo não tem. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!;
    out += c === undefined ? '=' : ALPHABET[n & 63]!;
  }
  return base64ToBase64Url(out);
}

export interface PkceDeps {
  randomBytes(length: number): Uint8Array;
  /** SHA-256 de uma string ASCII, em base64. */
  sha256Base64(value: string): Promise<string>;
}

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

export async function makePkce(deps: PkceDeps): Promise<Pkce> {
  const verifier = bytesToBase64Url(deps.randomBytes(32));
  const challenge = base64ToBase64Url(await deps.sha256Base64(verifier));
  const state = bytesToBase64Url(deps.randomBytes(16));
  return { verifier, challenge, state };
}

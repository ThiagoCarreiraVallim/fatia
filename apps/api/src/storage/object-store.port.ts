/**
 * O bucket de mídia, visto pela API (ADR 028). Porta e não o SDK direto: o
 * teste usa um bucket em memória, e trocar R2 por outro S3 não mexe em service.
 *
 * Nada aqui é público. Quem lê recebe URL assinada de curta duração, e quem
 * envia recebe URL assinada para um `PUT` com tipo e tamanho exatos.
 */
export interface ObjectStore {
  /** URL de envio direto do cliente. O storage recusa outro tipo ou tamanho. */
  presignPut(key: string, mime: string, bytes: number, expiresInSec: number): Promise<string>;
  presignGet(key: string, expiresInSec: number): Promise<string>;
  /** `null` quando o objeto não existe. */
  head(key: string): Promise<{ bytes: number; mime: string | null } | null>;
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, mime: string): Promise<void>;
  /** Apagar o que não existe não é erro. */
  delete(keys: string[]): Promise<void>;
}

/** `null` = storage desligado (sem as envs `MEDIA_S3_*`): envio responde 503. */
export const OBJECT_STORE = Symbol('OBJECT_STORE');

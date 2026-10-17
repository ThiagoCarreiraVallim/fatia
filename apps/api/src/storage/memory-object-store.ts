import type { ObjectStore } from './object-store.port';

/**
 * Bucket em memória para os testes. `upload` faz o papel do cliente que manda o
 * arquivo pela URL assinada, e a URL devolvida carrega o que foi assinado para
 * o teste conferir.
 */
export class MemoryObjectStore implements ObjectStore {
  readonly objects = new Map<string, { body: Buffer; mime: string }>();

  async presignPut(key: string, mime: string, bytes: number, expiresInSec: number) {
    return `memory://put/${key}?mime=${encodeURIComponent(mime)}&bytes=${bytes}&ttl=${expiresInSec}`;
  }

  async presignGet(key: string, expiresInSec: number) {
    return `memory://get/${key}?ttl=${expiresInSec}`;
  }

  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { bytes: o.body.length, mime: o.mime } : null;
  }

  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error(`NoSuchKey ${key}`);
    return o.body;
  }

  async put(key: string, body: Buffer, mime: string) {
    this.objects.set(key, { body, mime });
  }

  async delete(keys: string[]) {
    for (const k of keys) this.objects.delete(k);
  }

  /** O que o cliente faria com a URL de envio. */
  upload(key: string, body: Buffer, mime: string) {
    this.objects.set(key, { body, mime });
  }
}

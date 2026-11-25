import { uploadChatPhoto } from '@fatia/api-client';
import type { ChatPhotoUploader } from './chat-session';

type Put = (
  url: string,
  init: { method: 'PUT'; headers: Record<string, string>; body: ArrayBuffer },
) => Promise<{ ok: boolean; status: number }>;

function base64ToBytes(base64: string): ArrayBuffer {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Sobe a foto do chat direto ao bucket (ADR 046) com os bytes que o seletor já entregou em
 * base64 (#482). Reler o arquivo com `fetch(uri).blob()` não serve: o `fetch` da Expo devolve
 * para `file://` um corpo que não é a foto, o tamanho assinado não bate e o bucket recusa (403).
 */
export function createChatPhotoUploader(put: Put): ChatPhotoUploader {
  return async (foto) => {
    const body = base64ToBytes(foto.data);
    return uploadChatPhoto({ mime: 'image/jpeg', bytes: body.byteLength }, (url, headers) =>
      put(url, { method: 'PUT', headers, body }),
    );
  };
}

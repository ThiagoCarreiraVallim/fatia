import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from '@assistant-ui/react';
import type { LangChainMessage } from '@assistant-ui/react-langgraph';
import {
  ApiError,
  uploadChatPhoto,
  type ChatHistoryPhoto,
  type ChatPhoto,
} from '@fatia/api-client';

/**
 * A foto do chat, preparada no aparelho e guardada no bucket (ADR 046).
 *
 * **Recodificar é o que tira o EXIF** antes de a foto sair daqui: o canvas só tem
 * pixels, e o JPEG que sai dele não carrega GPS, aparelho nem horário. A
 * orientação que o EXIF trazia é aplicada antes (`imageOrientation:
 * 'from-image'`), para a foto não chegar deitada. A API reprocessa de novo no
 * `confirm`, para o cliente que não fizer isto.
 *
 * O lado maior cai para `LADO_MAXIMO`: o modelo de visão não enxerga mais que
 * isso num prato.
 */

export const LADO_MAXIMO = 1280;
const QUALIDADE = 0.85;
const PREFIXO = 'data:image/jpeg;base64,';

/**
 * Como o id da foto guardada viaja na parte de imagem. A URL assinada serve para
 * desenhar a miniatura, e o id vai depois do `#`: o navegador não manda o
 * fragmento ao bucket, então a URL continua válida para o `<img>`.
 */
const MARCA_DO_ID = '#foto=';

async function comoBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export async function recodificarFoto(arquivo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Não deu para preparar a foto neste navegador.');
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALIDADE),
    );
    if (!jpeg) throw new Error('Não deu para preparar a foto neste navegador.');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

/** A parte de imagem de uma foto guardada: a URL para ver, e o id no fragmento. */
export function imagemDaFotoGuardada(foto: ChatHistoryPhoto): string {
  return `${foto.url ?? ''}${MARCA_DO_ID}${foto.id}`;
}

/**
 * Sobe a foto ao bucket e devolve a parte de imagem. Instância sem bucket
 * (`MEDIA_S3_*` vazias) responde 503 ao pedido de envio: aí a foto vai pelo
 * caminho antigo, em base64 dentro do turno, e não fica guardada (ADR 020).
 */
async function imagemDoTurno(jpeg: Blob): Promise<string> {
  try {
    const foto = await uploadChatPhoto({ mime: 'image/jpeg', bytes: jpeg.size }, (url, headers) =>
      fetch(url, { method: 'PUT', headers, body: jpeg }),
    );
    return imagemDaFotoGuardada(foto);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 503) {
      return `${PREFIXO}${await comoBase64(jpeg)}`;
    }
    throw erro;
  }
}

/** O anexo do composer: a foto é recodificada e guardada no envio, e vira uma parte de imagem. */
export const adaptadorDeFoto: AttachmentAdapter = {
  accept: 'image/*',
  async add({ file }): Promise<PendingAttachment> {
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: file.name || 'foto.jpg',
      contentType: 'image/jpeg',
      file,
      status: { type: 'requires-action', reason: 'composer-send' },
    };
  },
  async send(anexo): Promise<CompleteAttachment> {
    return {
      ...anexo,
      status: { type: 'complete' },
      content: [{ type: 'image', image: await imagemDoTurno(await recodificarFoto(anexo.file)) }],
    };
  },
  async remove() {},
};

/**
 * As fotos que o runtime pôs na fala da pessoa, prontas para o corpo do turno:
 * as guardadas pelo id, as do caminho antigo em base64.
 */
export function fotosDaMensagem(mensagem: LangChainMessage | undefined): {
  photoIds: string[];
  photos: ChatPhoto[];
} {
  const photoIds: string[] = [];
  const photos: ChatPhoto[] = [];
  if (!mensagem || typeof mensagem.content === 'string') return { photoIds, photos };
  for (const parte of mensagem.content) {
    if (parte.type !== 'image_url') continue;
    const url = typeof parte.image_url === 'string' ? parte.image_url : parte.image_url?.url;
    if (!url) continue;
    if (url.startsWith(PREFIXO)) {
      photos.push({ mediaType: 'image/jpeg', data: url.slice(PREFIXO.length) });
      continue;
    }
    const marca = url.lastIndexOf(MARCA_DO_ID);
    if (marca >= 0) photoIds.push(url.slice(marca + MARCA_DO_ID.length));
  }
  return { photoIds, photos };
}

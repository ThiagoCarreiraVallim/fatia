import type { AttachmentAdapter, CompleteAttachment, PendingAttachment } from '@assistant-ui/react';
import type { LangChainMessage } from '@assistant-ui/react-langgraph';
import type { ChatPhoto } from '@fatia/api-client';

/**
 * A foto do chat, preparada no aparelho.
 *
 * **Recodificar é o que tira o EXIF** (ADR 020): o canvas só tem pixels, e o
 * JPEG que sai dele não carrega GPS, aparelho nem horário. A orientação que o
 * EXIF trazia é aplicada antes (`imageOrientation: 'from-image'`), para a foto
 * não chegar deitada ao modelo. A API tira metadados de novo, para o cliente que
 * não fizer isto.
 *
 * O lado maior cai para `LADO_MAXIMO`: o modelo de visão não enxerga mais que
 * isso num prato, e cada foto viaja em base64 dentro do corpo do turno.
 */

export const LADO_MAXIMO = 1280;
const QUALIDADE = 0.85;
const PREFIXO = 'data:image/jpeg;base64,';

async function comoBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export async function recodificarFoto(arquivo: Blob): Promise<string> {
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
    return comoBase64(jpeg);
  } finally {
    bitmap.close();
  }
}

/** O anexo do composer: a foto é recodificada no envio, e vira uma parte de imagem. */
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
      content: [{ type: 'image', image: `${PREFIXO}${await recodificarFoto(anexo.file)}` }],
    };
  },
  async remove() {},
};

/** As fotos que o runtime pôs na fala da pessoa, prontas para o corpo do turno. */
export function fotosDaMensagem(mensagem: LangChainMessage | undefined): ChatPhoto[] {
  if (!mensagem || typeof mensagem.content === 'string') return [];
  return mensagem.content.flatMap((parte) => {
    if (parte.type !== 'image_url') return [];
    const url = typeof parte.image_url === 'string' ? parte.image_url : parte.image_url?.url;
    return url?.startsWith(PREFIXO)
      ? [{ mediaType: 'image/jpeg' as const, data: url.slice(PREFIXO.length) }]
      : [];
  });
}

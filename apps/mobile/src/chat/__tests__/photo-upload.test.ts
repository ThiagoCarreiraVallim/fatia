import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadChatPhoto = vi.fn();
vi.mock('@fatia/api-client', () => ({
  uploadChatPhoto: (...args: unknown[]) => uploadChatPhoto(...args),
}));

const { createChatPhotoUploader } = await import('../photo-upload');

// "JPEG!" em base64: cinco bytes conhecidos.
const FOTO = { uri: 'file:///cache/ImagePicker/x.jpg', data: 'SlBFRyE=' };

describe('createChatPhotoUploader (#482)', () => {
  beforeEach(() => {
    uploadChatPhoto.mockImplementation(async (_input, put) => {
      await put('https://bucket/x', { 'Content-Type': 'image/jpeg' });
      return { id: 'f1' };
    });
  });

  // O `fetch` da Expo lia o `file://` como 14 bytes que não eram a foto: o bucket recusava a
  // assinatura (403) e a foto nunca chegava à conversa.
  it('sobe os bytes da foto que o seletor já entregou, sem reler o arquivo', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const subir = createChatPhotoUploader(put);

    await expect(subir(FOTO)).resolves.toEqual({ id: 'f1' });

    expect(uploadChatPhoto).toHaveBeenCalledWith(
      { mime: 'image/jpeg', bytes: 5 },
      expect.any(Function),
    );
    const corpo = put.mock.calls[0]![1].body as ArrayBuffer;
    expect(corpo).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(corpo))).toEqual([0x4a, 0x50, 0x45, 0x47, 0x21]);
  });
});

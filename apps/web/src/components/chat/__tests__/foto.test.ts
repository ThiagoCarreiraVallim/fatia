import { afterEach, describe, expect, it, vi } from 'vitest';

const uploadChatPhoto = vi.hoisted(() => vi.fn());
vi.mock('@fatia/api-client', async (original) => ({
  ...(await original<typeof import('@fatia/api-client')>()),
  uploadChatPhoto,
}));
import type { LangChainMessage } from '@assistant-ui/react-langgraph';
import { ApiError } from '@fatia/api-client';
import { adaptadorDeFoto, fotosDaMensagem, LADO_MAXIMO, recodificarFoto } from '../foto';
import { formatoDeGravacao } from '../use-ditado';
import { AVISO_DE_FOTO, historyToMessages } from '../historico';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  uploadChatPhoto.mockReset();
});

/** O canvas falso: qualquer imagem vira o JPEG mínimo `FF D8 FF D9`. */
function canvasFalso() {
  const fechar = vi.fn();
  const createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close: fechar }));
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  const drawImage = vi.fn();
  const toBlob = vi.fn((pronto: (b: Blob | null) => void, tipo: string) =>
    pronto(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: tipo })),
  );
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
  const criar = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : criar(tag),
  );
  return { canvas, toBlob, fechar, createImageBitmap };
}

describe('recodificarFoto', () => {
  it('redesenha num canvas com a orientação do EXIF aplicada, reduz e sai JPEG', async () => {
    const { canvas, toBlob, fechar, createImageBitmap } = canvasFalso();

    const jpeg = await recodificarFoto(new Blob(['qualquer']));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'from-image',
    });
    expect([canvas.width, canvas.height]).toEqual([LADO_MAXIMO, 960]);
    expect(toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(jpeg.type).toBe('image/jpeg');
    expect(jpeg.size).toBe(4);
    expect(fechar).toHaveBeenCalled();
  });
});

describe('adaptadorDeFoto.send (ADR 046)', () => {
  const anexo = {
    id: 'a1',
    type: 'image' as const,
    name: 'prato.jpg',
    contentType: 'image/jpeg',
    file: new File(['x'], 'prato.jpg'),
    status: { type: 'requires-action' as const, reason: 'composer-send' as const },
  };

  it('sobe o JPEG recodificado ao bucket e a parte leva a URL e o id', async () => {
    canvasFalso();
    uploadChatPhoto.mockImplementation(async (_input, put) => {
      await put('https://bucket/assinada', { 'Content-Type': 'image/jpeg' });
      return { id: 'foto-1', url: 'https://bucket/ler?x=1', width: 1280, height: 960 };
    });
    const fetchFalso = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);

    const pronto = await adaptadorDeFoto.send(anexo);

    expect(uploadChatPhoto).toHaveBeenCalledWith(
      { mime: 'image/jpeg', bytes: 4 },
      expect.any(Function),
    );
    expect(fetchFalso).toHaveBeenCalledWith('https://bucket/assinada', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: expect.any(Blob),
    });
    expect(pronto.content).toEqual([
      { type: 'image', image: 'https://bucket/ler?x=1#foto=foto-1' },
    ]);
  });

  it('instância sem bucket (503) manda a foto pelo caminho antigo, em base64', async () => {
    canvasFalso();
    uploadChatPhoto.mockRejectedValue(new ApiError('sem bucket', 503));

    const pronto = await adaptadorDeFoto.send(anexo);

    expect(pronto.content).toEqual([{ type: 'image', image: 'data:image/jpeg;base64,/9j/2Q==' }]);
  });

  it('outra falha do envio aparece, em vez de a foto sair sem ser guardada', async () => {
    canvasFalso();
    uploadChatPhoto.mockRejectedValue(new ApiError('cota', 429));

    await expect(adaptadorDeFoto.send(anexo)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fotosDaMensagem', () => {
  it('a guardada vai pelo id, a do caminho antigo em base64, e outra URL é ignorada', () => {
    const mensagem = {
      type: 'human',
      content: [
        { type: 'text', text: 'o que é isso?' },
        { type: 'image_url', image_url: { url: 'https://bucket/ler?x=1#foto=foto-1' } },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        { type: 'image_url', image_url: { url: 'https://exemplo.com/foto.png' } },
      ],
    } as LangChainMessage;

    expect(fotosDaMensagem(mensagem)).toEqual({
      photoIds: ['foto-1'],
      photos: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
    });
    expect(fotosDaMensagem({ type: 'human', content: 'só texto' } as LangChainMessage)).toEqual({
      photoIds: [],
      photos: [],
    });
  });
});

describe('formatoDeGravacao', () => {
  it('escolhe o primeiro que o navegador grava, e nada quando não grava nenhum', () => {
    expect(formatoDeGravacao((tipo) => tipo === 'audio/mp4')).toBe('audio/mp4');
    expect(formatoDeGravacao(() => false)).toBeUndefined();
  });
});

describe('historyToMessages com foto', () => {
  it('a fala que levou foto volta com o aviso de que ela não foi guardada', () => {
    const [fala] = historyToMessages([
      {
        id: 'm1',
        role: 'user',
        content: 'o que tem aqui?',
        tools: null,
        metadata: { photos: 1 },
        runId: null,
        review: null,
        createdAt: '2026-09-25T12:00:00Z',
      },
    ]);

    expect(fala.content).toBe(`o que tem aqui?\n\n${AVISO_DE_FOTO}`);
  });

  it('a fala com foto guardada volta com a imagem, que leva o id para o próximo envio', () => {
    const [fala] = historyToMessages([
      {
        id: 'm1',
        role: 'user',
        content: 'o que tem aqui?',
        tools: null,
        metadata: null,
        runId: null,
        review: null,
        createdAt: '2026-11-05T12:00:00Z',
        photos: [{ id: 'foto-1', url: 'https://bucket/ler?x=1', width: 1280, height: 960 }],
      },
    ]);

    expect(fala.content).toEqual([
      { type: 'text', text: 'o que tem aqui?' },
      { type: 'image_url', image_url: { url: 'https://bucket/ler?x=1#foto=foto-1' } },
    ]);
  });
});

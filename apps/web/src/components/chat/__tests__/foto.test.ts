import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LangChainMessage } from '@assistant-ui/react-langgraph';
import { fotosDaMensagem, LADO_MAXIMO, recodificarFoto } from '../foto';
import { formatoDeGravacao } from '../use-ditado';
import { AVISO_DE_FOTO, historicoParaMensagens } from '../historico';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recodificarFoto', () => {
  it('redesenha num canvas com a orientação do EXIF aplicada, reduz e sai JPEG', async () => {
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

    const base64 = await recodificarFoto(new Blob(['qualquer']));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(Blob), {
      imageOrientation: 'from-image',
    });
    expect([canvas.width, canvas.height]).toEqual([LADO_MAXIMO, 960]);
    expect(toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(base64).toBe('/9j/2Q==');
    expect(fechar).toHaveBeenCalled();
  });
});

describe('fotosDaMensagem', () => {
  it('só as partes de imagem recodificadas viram foto do turno', () => {
    const mensagem = {
      type: 'human',
      content: [
        { type: 'text', text: 'o que é isso?' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        { type: 'image_url', image_url: { url: 'https://exemplo.com/foto.png' } },
      ],
    } as LangChainMessage;

    expect(fotosDaMensagem(mensagem)).toEqual([{ mediaType: 'image/jpeg', data: 'AAAA' }]);
    expect(fotosDaMensagem({ type: 'human', content: 'só texto' } as LangChainMessage)).toEqual([]);
  });
});

describe('formatoDeGravacao', () => {
  it('escolhe o primeiro que o navegador grava, e nada quando não grava nenhum', () => {
    expect(formatoDeGravacao((tipo) => tipo === 'audio/mp4')).toBe('audio/mp4');
    expect(formatoDeGravacao(() => false)).toBeUndefined();
  });
});

describe('historicoParaMensagens com foto', () => {
  it('a fala que levou foto volta com o aviso de que ela não foi guardada', () => {
    const [fala] = historicoParaMensagens([
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
});

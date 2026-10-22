import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWakeLock } from '../use-wake-lock';

/**
 * O lock de tela da sessão. O que importa: pede ao montar, pede de novo quando
 * a aba volta (o navegador solta sozinho ao esconder), solta ao desmontar e,
 * sem a API, não quebra.
 */

function makeSentinel() {
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };
  return sentinel;
}

let visibility: DocumentVisibilityState = 'visible';
const request = vi.fn();

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  visibility = 'visible';
  request.mockReset();
  request.mockImplementation(async () => makeSentinel());
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- some de novo para o caso "sem suporte" valer de verdade.
  delete navigator.wakeLock;
});

describe('useWakeLock', () => {
  it('pede o lock de tela ao montar', async () => {
    renderHook(() => useWakeLock());
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('pede de novo quando a aba volta, depois de o navegador soltar', async () => {
    const first = makeSentinel();
    request.mockResolvedValueOnce(first);
    renderHook(() => useWakeLock());
    await act(async () => {});

    // Aba escondida: o navegador solta o lock e não adianta pedir agora.
    first.released = true;
    await act(async () => setVisibility('hidden'));
    expect(request).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('visible'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('não pede outro enquanto o atual segue de pé', async () => {
    renderHook(() => useWakeLock());
    await act(async () => {});
    await act(async () => setVisibility('visible'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('solta o lock e para de ouvir a aba ao desmontar', async () => {
    const sentinel = makeSentinel();
    request.mockResolvedValueOnce(sentinel);
    const { unmount } = renderHook(() => useWakeLock());
    await act(async () => {});

    unmount();
    expect(sentinel.release).toHaveBeenCalled();

    await act(async () => setVisibility('visible'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('solta na hora o lock que chega depois de a tela sair', async () => {
    const sentinel = makeSentinel();
    let resolve!: (s: typeof sentinel) => void;
    request.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useWakeLock());

    unmount();
    await act(async () => resolve(sentinel));
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('não faz nada quando desligado', async () => {
    renderHook(() => useWakeLock(false));
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });

  it('segue sem lock quando o navegador recusa', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
    await act(async () => {});
  });

  it('não quebra em navegador sem a API', async () => {
    // @ts-expect-error -- simula navegador sem Wake Lock.
    delete navigator.wakeLock;
    expect('wakeLock' in navigator).toBe(false);
    const { unmount } = renderHook(() => useWakeLock());
    await act(async () => setVisibility('visible'));
    unmount();
    expect(request).not.toHaveBeenCalled();
  });
});

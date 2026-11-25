import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURACAO_MAXIMA_DO_DITADO_MS, useDitado } from '../use-ditado';

/**
 * O teto de duração do ditado na web (#488, PR #496). O app já para em 2 min; a web gravava até a
 * pessoa parar, e o agente recusa acima de 150 s (o preço da transcrição é por duração). Sem o
 * corte aqui, quem fala por três minutos perde tudo num 413.
 */

class GravadorFalso {
  static ultimo: GravadorFalso | null = null;
  mimeType = 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((evento: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
  });
  static isTypeSupported = () => true;
  constructor() {
    GravadorFalso.ultimo = this;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', GravadorFalso);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  GravadorFalso.ultimo = null;
});

describe('useDitado — teto de duração', () => {
  it('para sozinho em dois minutos, abaixo do teto do agente', async () => {
    const { result } = renderHook(() => useDitado(vi.fn(), vi.fn()));

    await act(async () => {
      await result.current.comecar();
    });
    const gravador = GravadorFalso.ultimo!;
    expect(gravador.start).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DURACAO_MAXIMA_DO_DITADO_MS - 1));
    expect(gravador.stop).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(gravador.stop).toHaveBeenCalledTimes(1);
    expect(DURACAO_MAXIMA_DO_DITADO_MS).toBeLessThanOrEqual(120_000);
  });

  it('parar antes do teto desarma o corte', async () => {
    const { result } = renderHook(() => useDitado(vi.fn(), vi.fn()));

    await act(async () => {
      await result.current.comecar();
    });
    const gravador = GravadorFalso.ultimo!;
    act(() => result.current.parar());
    act(() => vi.advanceTimersByTime(DURACAO_MAXIMA_DO_DITADO_MS));

    expect(gravador.stop).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from 'vitest';
import { TOAST_IDLE, toastReducer, type ToastSlot } from '../toast-queue';

/**
 * #471: o toast novo aparecia no lugar do anterior e "teleportava". A troca
 * passa por aqui: com um toast na tela, o novo espera o atual sair (animação de
 * saída) e só então entra, sempre de cima.
 */
const a = { id: 1, message: 'Salvo' };
const b = { id: 2, message: 'Apagado' };
const c = { id: 3, message: 'Copiado' };

describe('toastReducer', () => {
  it('sem nada na tela, o toast entra direto', () => {
    expect(toastReducer(TOAST_IDLE, { type: 'show', toast: a })).toEqual({
      visible: a,
      queued: null,
      phase: 'entering',
    });
  });

  it('com um toast na tela, o novo espera o atual sair', () => {
    const shown: ToastSlot<typeof a> = { visible: a, queued: null, phase: 'entering' };
    expect(toastReducer(shown, { type: 'show', toast: b })).toEqual({
      visible: a,
      queued: b,
      phase: 'leaving',
    });
  });

  it('terminada a saída, o da fila entra', () => {
    const leaving: ToastSlot<typeof a> = { visible: a, queued: b, phase: 'leaving' };
    expect(toastReducer(leaving, { type: 'exited' })).toEqual({
      visible: b,
      queued: null,
      phase: 'entering',
    });
  });

  it('vários seguidos: vale o mais novo, sem empilhar', () => {
    const leaving: ToastSlot<typeof a> = { visible: a, queued: b, phase: 'leaving' };
    expect(toastReducer(leaving, { type: 'show', toast: c })).toEqual({
      visible: a,
      queued: c,
      phase: 'leaving',
    });
  });

  it('o tempo acabou: sai com animação, e só depois some', () => {
    const shown: ToastSlot<typeof a> = { visible: a, queued: null, phase: 'entering' };
    const leaving = toastReducer(shown, { type: 'dismiss' });
    expect(leaving).toEqual({ visible: a, queued: null, phase: 'leaving' });
    expect(toastReducer(leaving, { type: 'exited' })).toEqual(TOAST_IDLE);
  });

  it('dispensar o que já está saindo não perde o da fila', () => {
    const leaving: ToastSlot<typeof a> = { visible: a, queued: b, phase: 'leaving' };
    expect(toastReducer(leaving, { type: 'dismiss' })).toBe(leaving);
  });

  it('eventos fora de hora não mexem em nada', () => {
    expect(toastReducer(TOAST_IDLE, { type: 'dismiss' })).toBe(TOAST_IDLE);
    expect(toastReducer(TOAST_IDLE, { type: 'exited' })).toBe(TOAST_IDLE);
  });
});

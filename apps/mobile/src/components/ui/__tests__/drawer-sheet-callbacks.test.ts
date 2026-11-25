import { describe, expect, it } from 'vitest';
import {
  drawerSheetCallbacks,
  drawerStep,
  type DrawerEffect,
  type DrawerEvent,
  type DrawerPhase,
} from '../drawer-state';

/**
 * Os avisos do @gorhom (5.2.14) que nem sempre chegam (#483):
 *
 * - `onAnimate` é pulado quando, ao chegar no JS, a animação já terminou
 *   (alvo igual ao índice atual). Com "reduzir movimento" a descida é
 *   instantânea, e só chega o fim.
 * - Fechar durante a subida (o índice atual ainda é -1 até a subida assentar)
 *   não emite `onAnimate` nem `onChange`; só o `onClose`, que o gorhom chama
 *   sempre que a animação termina em -1.
 */
function harness(dirty: boolean) {
  let phase: DrawerPhase = 'open';
  const effects: DrawerEffect[] = [];
  const send = (type: DrawerEvent['type']) => {
    const next = drawerStep(phase, { type }, dirty);
    phase = next.phase;
    effects.push(...next.effects);
  };
  return { callbacks: drawerSheetCallbacks(send), phase: () => phase, effects };
}

describe('folha: avisos do gorhom que faltam', () => {
  it('fechar durante a subida: só o onClose chega, e a folha fecha avisando o pai', () => {
    const h = harness(false);
    h.callbacks.onClose();
    expect(h.phase()).toBe('closed');
    expect(h.effects).toContain('notifyClosed');
  });

  it('descida sem aviso de início, com rascunho mexido: a folha volta e pergunta', () => {
    const h = harness(true);
    h.callbacks.onClose();
    expect(h.phase()).toBe('open');
    expect(h.effects).toEqual(['snapBack', 'confirmDiscard']);
  });

  it('descida normal: o início avisa o pai uma vez, e o fim só desmonta', () => {
    const h = harness(false);
    h.callbacks.onAnimate(0, -1);
    h.callbacks.onClose();
    expect(h.phase()).toBe('closed');
    expect(h.effects.filter((e) => e === 'notifyClosed')).toHaveLength(1);
  });

  it('subir não é fechar', () => {
    const h = harness(false);
    h.callbacks.onAnimate(-1, 0);
    expect(h.phase()).toBe('open');
    expect(h.effects).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { drawerStep } from '../drawer-state';

/**
 * A folha (#483): fechar pelo gesto, por mais rápido, assenta antes de sumir;
 * o pai fica sabendo na hora; e um rascunho mexido volta e pergunta.
 */
describe('estado do drawer', () => {
  it('abrir monta e sobe a folha', () => {
    expect(drawerStep('closed', { type: 'open' }, false)).toEqual({
      phase: 'open',
      effects: ['expand'],
    });
  });

  it('o pai fecha: a folha desce animada e só some quando assentar', () => {
    expect(drawerStep('open', { type: 'close' }, false)).toEqual({
      phase: 'closing',
      effects: ['animateClose'],
    });
    expect(drawerStep('closing', { type: 'closed' }, false)).toEqual({
      phase: 'closed',
      effects: [],
    });
  });

  it('arrastar para baixo (ou tocar fora) avisa o pai já, mas a folha continua montada até assentar', () => {
    expect(drawerStep('open', { type: 'dismiss' }, false)).toEqual({
      phase: 'closing',
      effects: ['notifyClosed', 'animateClose'],
    });
  });

  it('com rascunho mexido, a folha volta e pergunta antes de descartar', () => {
    expect(drawerStep('open', { type: 'dismiss' }, true)).toEqual({
      phase: 'open',
      effects: ['snapBack', 'confirmDiscard'],
    });
  });

  it('o fim da animação sem aviso de início (fling rápido demais) ainda avisa o pai', () => {
    expect(drawerStep('open', { type: 'closed' }, false)).toEqual({
      phase: 'closed',
      effects: ['notifyClosed'],
    });
  });

  it('reabrir no meio da descida sobe de novo, sem desmontar', () => {
    expect(drawerStep('closing', { type: 'open' }, false)).toEqual({
      phase: 'open',
      effects: ['expand'],
    });
  });

  it('o segundo aviso de fechamento da mesma descida não faz nada', () => {
    expect(drawerStep('closing', { type: 'dismiss' }, true)).toEqual({
      phase: 'closing',
      effects: [],
    });
    expect(drawerStep('closing', { type: 'close' }, false)).toEqual({
      phase: 'closing',
      effects: [],
    });
  });

  it('fechada, só abrir muda alguma coisa', () => {
    for (const type of ['close', 'dismiss', 'closed'] as const) {
      expect(drawerStep('closed', { type }, false)).toEqual({ phase: 'closed', effects: [] });
    }
  });
});

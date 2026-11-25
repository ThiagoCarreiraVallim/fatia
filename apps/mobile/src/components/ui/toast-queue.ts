/**
 * A vez de cada toast (#471), fora do componente para caber no harness de Node.
 *
 * Há uma vaga só na tela. `entering`: o toast entrou (ou está entrando) e fica
 * até o tempo acabar. `leaving`: está saindo, com animação; o que chegar nesse
 * meio tempo espera em `queued` e entra quando a saída terminar (`exited`),
 * de cima, como qualquer toast novo. Vários seguidos não empilham: vale o mais
 * novo.
 */
export interface ToastSlot<T> {
  visible: T | null;
  queued: T | null;
  phase: 'idle' | 'entering' | 'leaving';
}

export type ToastEvent<T> = { type: 'show'; toast: T } | { type: 'dismiss' } | { type: 'exited' };

export const TOAST_IDLE: ToastSlot<never> = { visible: null, queued: null, phase: 'idle' };

export function toastReducer<T>(state: ToastSlot<T>, event: ToastEvent<T>): ToastSlot<T> {
  switch (event.type) {
    case 'show':
      if (state.phase === 'idle') return { visible: event.toast, queued: null, phase: 'entering' };
      return { visible: state.visible, queued: event.toast, phase: 'leaving' };
    case 'dismiss':
      return state.phase === 'entering' ? { ...state, phase: 'leaving' } : state;
    case 'exited':
      if (state.phase !== 'leaving') return state;
      return state.queued ? { visible: state.queued, queued: null, phase: 'entering' } : TOAST_IDLE;
  }
}

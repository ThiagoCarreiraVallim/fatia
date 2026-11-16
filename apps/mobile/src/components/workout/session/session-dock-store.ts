/**
 * O "Concluir série" preso no rodapé da sessão (prancha Al-T3, pedido do dono
 * na etapa 4). O botão nasce no card do exercício, que mora dentro da rolagem,
 * mas é desenhado fora dela, embaixo da tela. A loja é o caminho: o card põe o
 * botão nela a cada render e só o rodapé (`SessionDockHost`) redesenha — sem
 * isso o estado ficaria na tela da sessão, que redesenharia o card, que poria
 * o botão de novo, sem fim.
 *
 * Fora do componente para caber no harness de Node (`vitest.config.ts`).
 */
export interface DockStore<T> {
  get: () => T | null;
  set: (node: T | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createDockStore<T>(): DockStore<T> {
  let current: T | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (node) => {
      if (Object.is(node, current)) return;
      current = node;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Do botão à borda de baixo, acima da área segura. */
const DOCK_GAP = 16;
/** Entre o último item da rolagem e o topo do botão. */
const DOCK_CLEARANCE = 16;
/** Sem botão, o mesmo respiro de antes no fim da rolagem. */
const BREATHING_ROOM = 32;

/**
 * Onde o botão fica e quanto o fim da rolagem reserva para ele não cobrir o
 * último item. `dockHeight` é a altura medida do rodapé (0 sem botão).
 */
export function dockLayout({ safeBottom, dockHeight }: { safeBottom: number; dockHeight: number }) {
  const bottom = safeBottom + DOCK_GAP;
  return {
    bottom,
    scrollPaddingBottom:
      dockHeight > 0 ? bottom + dockHeight + DOCK_CLEARANCE : safeBottom + BREATHING_ROOM,
  };
}

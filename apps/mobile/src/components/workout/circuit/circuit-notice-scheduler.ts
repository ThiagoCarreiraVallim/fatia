import type { CircuitNotice } from './circuit-alarms';

/**
 * Os avisos do circuito entre o fundo e a volta ao app (#380), sem módulo
 * nativo: quem agenda e quem cancela chegam por parâmetro, e o teste roda em
 * Node. O app agenda ao ir para o fundo e cancela ao voltar.
 */
export interface CircuitNoticeScheduler {
  background(): void;
  active(): void;
  dispose(): void;
}

export function createCircuitNoticeScheduler(deps: {
  /** Os avisos que faltam, contados no horário passado. */
  notices: (now: number) => CircuitNotice[];
  schedule: (notices: CircuitNotice[]) => Promise<string[]>;
  cancel: (ids: string[]) => void;
  now?: () => number;
}): CircuitNoticeScheduler {
  const now = deps.now ?? Date.now;
  let scheduled: string[] = [];
  // Cada ida e volta troca a ficha: o agendamento que termina com a ficha
  // velha (a pessoa voltou, ou a tela saiu) cancela o que agendou.
  let epoch = 0;
  let pending = false;
  let alive = true;
  return {
    background() {
      if (scheduled.length > 0 || pending) return;
      const token = ++epoch;
      pending = true;
      void deps
        .schedule(deps.notices(now()))
        .then((ids) => {
          if (alive && token === epoch) scheduled = ids;
          else deps.cancel(ids);
        })
        .finally(() => {
          if (token === epoch) pending = false;
        });
    },
    active() {
      epoch++;
      pending = false;
      const ids = scheduled;
      scheduled = [];
      deps.cancel(ids);
    },
    dispose() {
      alive = false;
      epoch++;
      deps.cancel(scheduled);
      scheduled = [];
    },
  };
}

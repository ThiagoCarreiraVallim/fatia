import { createContext, useContext, type ReactNode } from 'react';
import { useRestTimer, type RestTimer } from './use-rest-timer';

/**
 * O descanso da sessão mora acima das telas (#369): a barra "treino em
 * andamento" mostra a contagem e o "+30 s" fora da sessão. Antes ele vivia na
 * tela da sessão e o desmonte (sair dela) cancelava o descanso e a notificação.
 *
 * O cronômetro continua sendo o `useRestTimer` (alvo em instante, háptico,
 * notificação local e a contagem na tela de bloqueio), com uma instância só
 * para o app inteiro.
 */
const RestTimerContext = createContext<RestTimer | null>(null);

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const timer = useRestTimer();
  return <RestTimerContext.Provider value={timer}>{children}</RestTimerContext.Provider>;
}

/** O descanso global. Fora do provider cai num cronômetro local, como antes. */
export function useSessionRestTimer(): RestTimer {
  const shared = useContext(RestTimerContext);
  const local = useRestTimer();
  return shared ?? local;
}

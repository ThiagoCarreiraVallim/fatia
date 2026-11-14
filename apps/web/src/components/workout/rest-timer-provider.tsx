'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useRestTimer, type RestTimer } from './use-rest-timer';

/**
 * O descanso da sessão mora acima das telas (#369): a barra "treino em
 * andamento" mostra a contagem e o "+30 s" em qualquer tela de ver, sem abrir
 * a sessão. Antes ele vivia na página do treino e zerava ao sair dela.
 *
 * O cronômetro em si continua sendo o `useRestTimer` (alvo em instante, não
 * contador), só que com uma instância para o app inteiro.
 */
const RestTimerContext = createContext<RestTimer | null>(null);

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const timer = useRestTimer();
  return <RestTimerContext.Provider value={timer}>{children}</RestTimerContext.Provider>;
}

/**
 * O descanso global. Fora do provider (teste de um componente solto) cai num
 * cronômetro local, que é o comportamento de antes.
 */
export function useSessionRestTimer(): RestTimer {
  const shared = useContext(RestTimerContext);
  const local = useRestTimer();
  return shared ?? local;
}

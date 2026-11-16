import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { createDockStore, type DockStore } from './session-dock-store';

const DockContext = createContext<DockStore<ReactNode> | null>(null);

/** A loja do rodapé da sessão: uma por tela, estável entre renders. */
export function useSessionDockStore(): DockStore<ReactNode> {
  const [store] = useState(() => createDockStore<ReactNode>());
  return store;
}

export const SessionDockProvider = DockContext.Provider;

/**
 * O card do exercício manda o "Concluir série" para o rodapé preso da sessão.
 * Fora de um `SessionDockProvider` o botão fica onde está: devolve o próprio
 * nó para o card desenhar no lugar.
 */
export function useDockedAction(node: ReactNode | null): ReactNode | null {
  const store = useContext(DockContext);
  const mine = useRef<ReactNode | null>(null);
  // A cada render: o botão leva o estado do card (carga, reps, "registrando").
  useLayoutEffect(() => {
    mine.current = node;
    store?.set(node);
  });
  // Ao sair, só limpa o que é seu: na troca de exercício o card novo já pôs o
  // botão dele, e apagar às cegas deixaria o rodapé vazio.
  useLayoutEffect(
    () => () => {
      if (store && store.get() === mine.current) store.set(null);
    },
    [store],
  );
  return store ? null : node;
}

/**
 * O rodapé preso embaixo da tela, fora da rolagem (prancha Al-T3). Mede a
 * própria altura para a tela reservar o espaço no fim da rolagem.
 */
export function SessionDockHost({
  store,
  bottom,
  onHeight,
}: {
  store: DockStore<ReactNode>;
  bottom: number;
  onHeight: (height: number) => void;
}) {
  const node = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => onHeight(node ? e.nativeEvent.layout.height : 0)}
      style={{ bottom }}
      className="absolute inset-x-5"
    >
      {node}
    </View>
  );
}

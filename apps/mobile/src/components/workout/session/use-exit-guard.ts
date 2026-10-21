import { useCallback, useState } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

/**
 * Segura a saída da tela enquanto o treino está em andamento.
 *
 * Existem duas maneiras de sair, e as duas precisam do mesmo aviso: o botão
 * voltar do Android e a seta da top bar. Cobrir só uma é pior que não cobrir
 * nenhuma — o aviso aparece por um caminho e não pelo outro, e a pessoa aprende
 * que o app é imprevisível.
 *
 * O gesto de voltar no Android é a borda da tela, o mesmo canto onde o polegar
 * se apoia para digitar a carga. Sem aviso, um toque de raspão tira a pessoa da
 * sessão no meio de uma série.
 *
 * Sair não cancela nada — a sessão vive no servidor e volta pelo "Continuar
 * treino" da tela de treinos. O texto diz isso, em vez de assustar.
 *
 * A pergunta é um `ConfirmDrawer`, montado pela tela: o `Alert` do sistema
 * destoava do resto do app. Por isso o hook devolve o estado do drawer em vez
 * de abrir o diálogo ele mesmo.
 */
export function useSessionExitGuard() {
  const router = useRouter();
  const [exitOpen, setExitOpen] = useState(false);

  const requestExit = useCallback(() => setExitOpen(true), []);

  const leave = useCallback(() => {
    setExitOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        // Voltar com o drawer aberto fecha o drawer, como em todo sheet.
        setExitOpen((open) => !open);
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  return { exitOpen, setExitOpen, requestExit, leave };
}

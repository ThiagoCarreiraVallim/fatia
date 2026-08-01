import { useCallback } from 'react';
import { Alert, BackHandler } from 'react-native';
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
 * @returns `confirmExit`, para ligar no `onBack` do `Screen`.
 */
export function useSessionExitGuard(): () => void {
  const router = useRouter();

  const confirmExit = useCallback(() => {
    Alert.alert(
      'Sair da sessão?',
      'O treino continua em andamento — dá para voltar a ele pelo botão "Continuar treino" na tela de treinos.',
      [
        { text: 'Ficar no treino', style: 'cancel' },
        {
          text: 'Sair',
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace('/workout');
          },
        },
      ],
    );
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        confirmExit();
        return true;
      });
      return () => subscription.remove();
    }, [confirmExit]),
  );

  return confirmExit;
}

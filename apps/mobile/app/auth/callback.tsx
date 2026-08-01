import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/auth/auth-context';
import { LoadingState } from '@/components/ui';

/**
 * Rota de retorno do login.
 *
 * Ela existe porque o Expo Router é dono dos deep links: quando o navegador
 * devolve `fatia://auth/callback`, o roteador tenta casar `/auth/callback` com
 * um arquivo. Sem este, a pessoa termina o login e cai numa tela
 * **"Unmatched route"** — com a sessão possivelmente já estabelecida, o que é
 * pior, porque parece que falhou quando funcionou.
 *
 * Na prática o `promptAsync` do `expo-auth-session` costuma resolver primeiro e
 * fazer a troca do código; esta tela então só aparece por um instante. Quando o
 * roteador ganha a corrida, ela é o que impede o beco sem saída.
 *
 * Nenhum segredo passa por aqui: o `code` da URL não vale nada sem o
 * `code_verifier`, que nunca sai do processo do app.
 */
export default function AuthCallback() {
  const { status } = useAuth();

  useEffect(() => {
    // Fecha a aba do navegador do sistema, se ela ainda estiver de pé.
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (status === 'signedOut') return <Redirect href="/login" />;

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <LoadingState label="Concluindo login…" />
    </View>
  );
}

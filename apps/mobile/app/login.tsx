import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui';
import { missingEnvVars } from '@/env';

/**
 * Equivalente de `apps/web/src/app/(auth)/login/page.tsx`.
 *
 * No PWA o botão é um link para `/api/logto/sign-in` e o servidor conduz o
 * fluxo. Aqui o botão abre o navegador do sistema e o app conclui a troca do
 * código — ver `src/auth/auth-context.tsx`.
 */
export default function LoginScreen() {
  const { status, signIn, error } = useAuth();
  const router = useRouter();
  const missing = missingEnvVars();

  useEffect(() => {
    if (status === 'signedIn') router.replace('/');
  }, [status, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <View className="w-full max-w-sm gap-8">
        <View className="items-center gap-2">
          <Text accessibilityRole="header" className="text-4xl font-extrabold text-primary">
            Fatia
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Seu diário de nutrição e treino — rápido de registrar, fácil de acompanhar.
          </Text>
        </View>

        <View className="gap-3">
          {missing.length > 0 ? (
            // Sem isto a tela seria um botão que não faz nada e um erro só
            // visível no console do Metro — o modo mais lento de descobrir que
            // faltou copiar o .env.
            <View className="gap-2 rounded-md border border-destructive p-3">
              <Text className="text-sm font-medium text-foreground">Configuração incompleta</Text>
              <Text className="text-xs text-muted-foreground">
                Faltando: {missing.join(', ')}. Copie apps/mobile/.env.example para apps/mobile/.env
                e reinicie o Metro.
              </Text>
            </View>
          ) : (
            <>
              <Button size="lg" onPress={() => void signIn()} loading={status === 'loading'}>
                Entrar
              </Button>
              <Button
                size="lg"
                variant="outline"
                onPress={() => void signIn('register')}
                disabled={status === 'loading'}
              >
                Criar conta grátis
              </Button>
              <Button
                variant="link"
                onPress={() => void signIn('reset_password')}
                disabled={status === 'loading'}
              >
                Esqueci minha senha
              </Button>
            </>
          )}

          {error ? (
            <Text accessibilityRole="alert" className="text-center text-xs text-destructive">
              {error}
            </Text>
          ) : null}
        </View>

        <Text className="text-center text-xs text-muted-foreground">
          A mesma conta funciona no seu assistente de IA pelo conector MCP.
        </Text>
      </View>
    </View>
  );
}

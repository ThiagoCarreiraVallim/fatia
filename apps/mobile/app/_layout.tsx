import '../global.css';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@fatia/api-client';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { installMobileApiTransport } from '@/api/transport';

/**
 * Raiz do app.
 *
 * A ordem dos providers importa: `GestureHandlerRootView` precisa envolver tudo
 * (o bottom sheet depende dele), e o transporte da API precisa estar instalado
 * antes de qualquer query rodar — por isso `ApiBridge` fica entre o
 * `AuthProvider` e as telas, e não dentro delas.
 */

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // O equivalente móvel de `refetchOnWindowFocus: false` do PWA. Voltar
        // para o app depois de trocar de aplicativo não deve refazer toda a
        // tela — em rede móvel isso é meio segundo de spinner sem motivo.
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Repetir um 4xx nunca resolve: a resposta vai ser a mesma, e o
          // usuário espera três vezes mais para ver o mesmo erro.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

/**
 * Liga o cliente de API à sessão. Fica num componente próprio porque precisa do
 * `useAuth`, que só existe abaixo do `AuthProvider`.
 */
function ApiBridge({ children }: { children: React.ReactNode }) {
  const { getAccessToken, signOut } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installMobileApiTransport({
      getAccessToken,
      onSessionEnded: () => {
        void signOut();
      },
    });
    setReady(true);
  }, [getAccessToken, signOut]);

  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#131313' }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <ApiBridge>
            <QueryClientProvider client={queryClient}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#131313' },
                  // Gesto de voltar do iOS ligado em todas as telas; no Android
                  // o botão físico é tratado pelo próprio Expo Router.
                  gestureEnabled: true,
                }}
              >
                <Stack.Screen name="(app)" />
                <Stack.Screen name="login" options={{ gestureEnabled: false }} />
              </Stack>
            </QueryClientProvider>
          </ApiBridge>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

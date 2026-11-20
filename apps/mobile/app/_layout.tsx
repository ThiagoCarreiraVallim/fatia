import '../global.css';
import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@fatia/api-client';
import { AuthProvider, useAuth } from '@/auth/auth-context';
import { IdentitySync } from '@/auth/identity-sync';
import { installMobileApiTransport } from '@/api/transport';
import { colors } from '@/theme/colors';
import { ThemeProvider, useStoredThemePreference } from '@/theme/theme-provider';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Raiz do app.
 *
 * A ordem dos providers importa: `GestureHandlerRootView` precisa envolver tudo
 * (o bottom sheet depende dele), e o transporte da API precisa estar instalado
 * antes de qualquer query rodar — por isso `ApiBridge` fica entre o
 * `AuthProvider` e as telas, e não dentro delas.
 *
 * A splash fica na frente até as fontes (Sora e Manrope, #368) e a preferência
 * de tema (ADR 041) estarem prontas: sem isso a primeira tela piscaria na fonte
 * do sistema e no tema errado.
 */

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

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
    // Silenciado, não corrigido (#187). `installMobileApiTransport` escreve num
    // singleton de módulo — efeito colateral que não pode acontecer no render,
    // porque um render descartado deixaria o transporte instalado do mesmo
    // jeito. E o `ready` não é estado derivado de nada: ele é só a resposta de
    // "a instalação já rodou?", que é uma pergunta sobre o efeito e não pode ser
    // respondida antes dele. O portão existe para que nenhuma tela filha dispare
    // requisição sem token.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [getAccessToken, signOut]);

  if (!ready) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);
  const clearQueries = useCallback(() => queryClient.clear(), [queryClient]);
  const preference = useStoredThemePreference();
  // Erro ao carregar fonte não pode travar o app na splash: segue na do sistema.
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Sora_600SemiBold,
    Sora_700Bold,
  });
  const ready = preference !== null && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <ThemeProvider initialPreference={preference}>
          <AuthProvider onSignedOut={clearQueries}>
            <ApiBridge>
              <QueryClientProvider client={queryClient}>
                <IdentitySync />
                <ToastProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                      // Gesto de voltar do iOS ligado em todas as telas; no Android
                      // o botão físico é tratado pelo próprio Expo Router.
                      gestureEnabled: true,
                    }}
                  >
                    <Stack.Screen name="(app)" />
                    <Stack.Screen name="login" options={{ gestureEnabled: false }} />
                    {/* "Esqueci minha senha" abre com ou sem sessão (Você → Trocar senha). */}
                    <Stack.Screen name="forgot-password" />
                    {/* O link de convite abre sem sessão: fica fora do `(app)`, que exige login. */}
                    <Stack.Screen name="c/[token]" />
                  </Stack>
                </ToastProvider>
              </QueryClientProvider>
            </ApiBridge>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

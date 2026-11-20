import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Tabs, useIsFocused, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { keepMountedOnBlur, onboardingPending, usersApi } from '@fatia/api-client';
import { prefetchTabs } from '@/components/layout/tab-prefetch';
import { colors } from '@/theme/colors';
import { peekPendingInvite, takePendingInvite } from '@/community/pending-invite';
import { useAuth } from '@/auth/auth-context';
import { BottomChromeProvider, BottomNav } from '@/components/layout/bottom-nav';
import { AiMenuProvider } from '@/components/layout/ai-menu';
import { RestTimerProvider } from '@/components/workout/session/rest-timer-provider';
import { ConfirmProvider, DrawerPresenceProvider, LoadingState } from '@/components/ui';
import { usePush } from '@/notifications/use-push';
import { ChatProvider } from '@/chat/chat-provider';

/**
 * Guarda de sessão — equivalente de `apps/web/src/app/(app)/layout.tsx`, que
 * chama `getCurrentUser()` e faz `redirect('/login')`.
 *
 * A diferença é que no PWA a decisão acontece no servidor, antes de qualquer
 * pixel. Aqui a sessão vem do cofre do sistema, o que é assíncrono: existe um
 * intervalo em que ainda não se sabe se há sessão. Renderizar as telas nesse
 * intervalo faria as queries dispararem sem token e voltarem 401 — por isso o
 * estado `loading` tem tela própria em vez de cair direto no login.
 */
export default function AppLayout() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // `replace`, não `push`: com push, o botão voltar do Android levaria de
    // volta para dentro do app sem sessão.
    if (status === 'signedOut') router.replace('/login');
  }, [status, router]);

  // Quem ainda não passou pelo onboarding (ou parou numa etapa pulável) volta a
  // ele, na mesma tela (#371). Mesma chave do dashboard: não custa requisição a
  // mais. Erro ao ler o perfil não prende ninguém lá. O convite aberto antes do
  // login vira as boas-vindas da comunidade no onboarding.
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: status === 'signedIn',
  });
  const pending = me.data !== undefined && onboardingPending(me.data);
  useEffect(() => {
    if (!pending) return;
    void peekPendingInvite().then((token) =>
      router.replace(token ? `/onboarding?convite=${token}` : '/onboarding'),
    );
  }, [pending, router]);

  // Convite aberto antes do login, de quem já tinha passado pelo onboarding:
  // volta para ele uma vez.
  const ready = me.data !== undefined && !onboardingPending(me.data);
  useEffect(() => {
    if (!ready) return;
    void takePendingInvite().then((token) => {
      if (token) router.push(`/c/${token}`);
    });
  }, [ready, router]);

  // Avisos no celular (Fase 8c): refaz o cadastro e leva o toque à tela dele.
  usePush(ready);

  // As leituras de cada aba já no cache: a primeira troca de aba abre pronta.
  const qc = useQueryClient();
  useEffect(() => {
    if (ready) prefetchTabs(qc);
  }, [ready, qc]);

  if (status !== 'signedIn') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState label="" />
      </View>
    );
  }

  return (
    // O chat mora aqui, acima das abas: a resposta segue chegando enquanto a
    // pessoa navega (ADR 035).
    // O descanso também: a barra "treino em andamento" mostra a contagem fora
    // da sessão (#369).
    <ChatProvider>
      {/* Drawer aberto em qualquer tela esconde a barra de baixo (`ui/drawer.tsx`). */}
      <DrawerPresenceProvider>
        <ConfirmProvider>
          <RestTimerProvider>
            <BottomChromeProvider>
              {/* A tela atual encolhe até o notch quando o menu da IA abre
              (prancha Al-H6c5); a barra de abas some por cima dele. */}
              <AiMenuProvider nav={<BottomNav />}>
                <AppTabs />
              </AiMenuProvider>
            </BottomChromeProvider>
          </RestTimerProvider>
        </ConfirmProvider>
      </DrawerPresenceProvider>
    </ChatProvider>
  );
}

/**
 * Saída pelo lado ao trocar de tela: some e anda um pouco, e a nova entra do
 * outro lado. Curta, para a troca parecer instantânea.
 */
function sceneShift({ current }: { current: { progress: import('react-native').Animated.Value } }) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-14, 0, 14],
          }),
        },
      ],
    },
  };
}

/**
 * Detalhe e tarefa de foco desmontam ao perder o foco (câmera, cronômetro e
 * tela acesa não seguem rodando escondidos); as cinco abas ficam (item 6).
 */
function KeepTabsMounted({ name, children }: { name: string; children: ReactNode }) {
  const focused = useIsFocused();
  if (!focused && !keepMountedOnBlur(name)) return null;
  return <>{children}</>;
}

/**
 * As telas do app num navegador de abas, no lugar do antigo `<Slot />` que
 * desmontava a tela a cada troca (item 6). As abas (Hoje, Nutrição, Treino,
 * Comunidade, Você) ficam montadas e congeladas fora de foco: voltar a uma é
 * instantâneo e a rolagem fica onde estava. A barra é a `BottomNav`, desenhada
 * fora daqui (ela some com o menu da IA e ao rolar), então a do navegador não
 * existe. O voltar segue o histórico, como no Slot.
 *
 * Toda rota de `app/(app)` vira uma "aba" escondida deste navegador sem
 * registro: rota de foco nova só entra em `FOCUS_ROUTES` (`navigation.ts`).
 */
function AppTabs() {
  return (
    <Tabs
      tabBar={() => null}
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: colors.background },
        sceneStyleInterpolator: sceneShift,
        transitionSpec: { animation: 'timing', config: { duration: 180 } },
      }}
      screenLayout={({ route, children }) => (
        <KeepTabsMounted name={route.name}>{children}</KeepTabsMounted>
      )}
    />
  );
}

import { useEffect } from 'react';
import { View } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@fatia/api-client';
import { takePendingInvite } from '@/community/pending-invite';
import { useAuth } from '@/auth/auth-context';
import { BottomNav } from '@/components/layout/bottom-nav';
import { RegistroRapido } from '@/components/layout/registro-rapido';
import { LoadingState } from '@/components/ui';
import { usePush } from '@/notifications/use-push';
import { ChatProvider } from '@/chat/chat-provider';
import { BackgroundReply } from '@/components/chat/background-reply';

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

  // Quem ainda não passou pelo assistente vai para ele (mesma chave do
  // dashboard: não custa requisição a mais). Erro ao ler o perfil não prende
  // ninguém lá — só o `onboardedAt` nulo de verdade redireciona.
  const eu = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: status === 'signedIn',
  });
  const primeiraVez = eu.data !== undefined && eu.data.onboardedAt === null;
  useEffect(() => {
    if (primeiraVez) router.replace('/onboarding');
  }, [primeiraVez, router]);

  // Convite aberto antes do login (ou antes do assistente): volta para ele uma
  // vez, quando a pessoa já está dentro e passou pelo assistente.
  const pronto = eu.data !== undefined && eu.data.onboardedAt !== null;
  useEffect(() => {
    if (!pronto) return;
    void takePendingInvite().then((token) => {
      if (token) router.push(`/c/${token}`);
    });
  }, [pronto, router]);

  // Avisos no celular (Fase 8c): refaz o cadastro e leva o toque à tela dele.
  usePush(pronto);

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
    <ChatProvider>
      <View className="flex-1 bg-background">
        <Slot />
        <BackgroundReply />
        {/* O "+" global envolve a nav para acertar a ordem de pintura (ver o componente). */}
        <RegistroRapido>
          <BottomNav />
        </RegistroRapido>
      </View>
    </ChatProvider>
  );
}

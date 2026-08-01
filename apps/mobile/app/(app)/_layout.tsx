import { useEffect } from 'react';
import { View } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { BottomNav } from '@/components/layout/bottom-nav';
import { LoadingState } from '@/components/ui';

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

  if (status !== 'signedIn') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <LoadingState label="" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Slot />
      <BottomNav />
    </View>
  );
}

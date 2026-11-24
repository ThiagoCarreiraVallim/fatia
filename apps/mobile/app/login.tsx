import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-context';
import { AccountForm } from '@/components/auth/account-form';
import { Text } from '@/components/ui';
import { openLegal } from '@/components/profile/legal';
import { missingEnvVars } from '@/env';

/**
 * Onb-01b · Conta direta, o mesmo de `apps/web/src/app/(auth)/login/page.tsx`.
 *
 * No PWA o formulário vai a `/api/logto/sign-in` e o servidor conduz o fluxo.
 * Aqui o botão abre o navegador do sistema e o app conclui a troca do código —
 * ver `src/auth/auth-context.tsx`.
 */
export default function LoginScreen() {
  const { status } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const missing = missingEnvVars();

  useEffect(() => {
    if (status === 'signedIn') router.replace('/');
  }, [status, router]);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      className="flex-1 bg-background"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + 48,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
        gap: 14,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-4">
        <Text className="font-display text-[28px] text-primary">Fatia</Text>
        <Text
          accessibilityRole="header"
          className="font-display text-[34px] leading-[36px] text-foreground"
        >
          {'Comer e treinar,\nregistrado em segundos.'}
        </Text>
      </View>
      {missing.length > 0 ? (
        // Sem isto a tela seria um botão que não faz nada e um erro só visível
        // no console do Metro — o modo mais lento de descobrir que faltou o .env.
        <View className="gap-2 rounded-md border border-destructive p-3">
          <Text className="text-sm font-medium text-foreground">Configuração incompleta</Text>
          <Text className="text-xs text-muted-foreground">
            Faltando: {missing.join(', ')}. Copie apps/mobile/.env.example para apps/mobile/.env e
            reinicie o Metro.
          </Text>
        </View>
      ) : (
        <View className="mt-2">
          <AccountForm />
        </View>
      )}
      <View className="flex-1" />
      <Text className="text-center text-xs text-faint">
        Ao continuar você aceita os{' '}
        <Text className="text-xs text-faint underline" onPress={() => openLegal('/terms')}>
          Termos
        </Text>{' '}
        e a{' '}
        <Text className="text-xs text-faint underline" onPress={() => openLegal('/privacy')}>
          Privacidade
        </Text>
      </Text>
    </ScrollView>
  );
}

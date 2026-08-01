import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';

/**
 * Equivalente de `apps/web/src/components/layout/top-bar.tsx`.
 *
 * Ganha o que o PWA não precisa ter: um botão de voltar. No navegador existe a
 * seta do próprio navegador; aqui as telas internas (plano, sessão, metas de
 * nutrição) ficariam sem saída no iOS, onde não há botão físico.
 */
export function TopBar({ back = false, title }: { back?: boolean; title?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="absolute inset-x-0 top-0 z-50 border-b border-white/5 bg-background"
    >
      <View className="h-16 flex-row items-center justify-between px-5">
        <View className="flex-1 flex-row items-center gap-3">
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              className="-ml-2 h-11 w-11 items-center justify-center"
            >
              <ChevronLeft size={24} color="#e5e2e1" />
            </Pressable>
          ) : (
            <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-accent bg-card">
              <Text className="text-sm font-bold text-primary">F</Text>
            </View>
          )}
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 text-2xl font-extrabold leading-none text-primary"
          >
            {title ?? 'Fatia'}
          </Text>
        </View>
        {back ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notificações"
            className="h-11 w-11 items-center justify-center rounded-full"
          >
            <Bell size={20} color="#baccaf" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

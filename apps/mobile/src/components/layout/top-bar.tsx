import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

/** Altura da barra de voltar, sem a área segura. `Screen` reserva o mesmo. */
export const TOP_BAR_HEIGHT = 64;

/**
 * Barra de voltar das telas internas (plano, sessão, metas de nutrição), que no
 * iOS ficariam sem saída: não há botão físico.
 *
 * As telas principais não têm barra nenhuma — o PWA também não (a marca
 * "Fatia" repetida em toda tela só empurrava o conteúdo). Cada tela abre com o
 * próprio título.
 */
export function TopBar({
  back = false,
  title,
  onBack,
}: {
  back?: boolean;
  title?: string;
  /**
   * Intercepta a seta de voltar. Existe para a sessão de treino, que precisa
   * avisar antes de sair — sem isto o botão físico do Android passaria pela
   * guarda e a seta daqui não, o que é pior que não ter guarda nenhuma: o aviso
   * aparece por um caminho e não pelo outro.
   */
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!back) return null;

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="absolute inset-x-0 top-0 z-50 border-b border-white/5 bg-background"
    >
      <View
        style={{ height: TOP_BAR_HEIGHT }}
        className="flex-row items-center justify-between px-5"
      >
        <View className="flex-1 flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() =>
              onBack ? onBack() : router.canGoBack() ? router.back() : router.replace('/')
            }
            className="-ml-2 h-11 w-11 items-center justify-center"
          >
            <ChevronLeft size={24} color="#e5e2e1" />
          </Pressable>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 text-2xl font-extrabold leading-none text-primary"
          >
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
}

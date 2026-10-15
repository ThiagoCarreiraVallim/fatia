import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { routeInfo } from '@fatia/api-client';
import { cores } from '@/theme/cores';

/** Altura da barra de topo, sem a área segura. `Screen` reserva o mesmo. */
export const TOP_BAR_HEIGHT = 52;

/** Se a tela atual tem barra de topo: todas menos o Início, que é a raiz. */
export function useTopBarVisible(): boolean {
  return routeInfo(usePathname()).parent !== null;
}

/**
 * Barra de topo como no iOS, igual à do PWA (`app-top-bar.tsx`): "voltar" e o
 * título pequeno de onde a pessoa está, com as ações da tela à direita.
 *
 * Voltar sobe pelo mapa de rotas do api-client (`routeInfo`), não pelo
 * histórico: um link aberto direto (convite, notificação) também volta pelo
 * caminho certo até o Início, e por isso a barra de baixo não tem aba Início.
 */
export function TopBar({
  title,
  onBack,
  actions,
}: {
  /** Nome real da tela dinâmica (plano, treino). Sem ele, o título do mapa. */
  title?: string;
  /**
   * Intercepta a seta de voltar. Existe para a sessão de treino, que precisa
   * avisar antes de sair — sem isto o botão físico do Android passaria pela
   * guarda e a seta daqui não, o que é pior que não ter guarda nenhuma: o aviso
   * aparece por um caminho e não pelo outro.
   */
  onBack?: () => void;
  actions?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const info = routeInfo(usePathname());

  if (info.parent === null) return null;
  const parent = info.parent;

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="absolute inset-x-0 top-0 z-50 border-b border-white/5 bg-background"
    >
      <View style={{ height: TOP_BAR_HEIGHT }} className="flex-row items-center gap-1 px-2">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Voltar para ${info.parentTitle}`}
          onPress={() => (onBack ? onBack() : router.navigate(parent))}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
        >
          <ChevronLeft size={26} color={cores.primary} />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="flex-1 text-[17px] font-semibold text-foreground"
        >
          {title || info.title}
        </Text>
        {actions ? <View className="flex-row items-center gap-1 pr-1">{actions}</View> : null}
      </View>
    </View>
  );
}

/** Botão-ícone das ações da barra: mesmo alvo do "voltar". */
export const TOP_BAR_ACTION = 'h-11 w-11 items-center justify-center rounded-full active:bg-accent';

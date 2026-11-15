import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { hasTopBar, routeInfo } from '@fatia/api-client';
import { colors } from '@/theme/colors';
import { headerButtonClass } from './tab-header';

/** Altura da barra de topo, sem a área segura. `Screen` reserva o mesmo. */
export const TOP_BAR_HEIGHT = 60;

/**
 * Se a tela atual tem barra de topo: só as empurradas. As 5 abas abrem com o
 * `TabHeader` da própria tela (título grande e botões redondos).
 */
export function useTopBarVisible(): boolean {
  return hasTopBar(usePathname());
}

/**
 * Barra de topo das telas empurradas, igual à do PWA (`app-top-bar.tsx`) e às
 * pranchas (Al-V2, Al-N7): "voltar" num quadrado de cantos arredondados, o
 * título (Sora 17/600) no centro e as ações da tela à direita.
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
  const pathname = usePathname();
  const info = routeInfo(pathname);

  if (!hasTopBar(pathname)) return null;
  const parent = info.parent;

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="absolute inset-x-0 top-0 z-50 bg-background"
    >
      <View style={{ height: TOP_BAR_HEIGHT }} className="flex-row items-center gap-3 px-4">
        {parent !== null ? (
          <Pressable
            accessibilityRole="link"
            // Criar algo em tela cheia (Al-T19) fecha no X; o destino é o mesmo pai.
            accessibilityLabel={info.dismiss ? 'Fechar' : `Voltar para ${info.parentTitle ?? ''}`}
            onPress={() => (onBack ? onBack() : router.navigate(parent))}
            className={headerButtonClass()}
          >
            {info.dismiss ? (
              <X size={22} color={colors.foreground} />
            ) : (
              <ChevronLeft size={22} color={colors.foreground} />
            )}
          </Pressable>
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="flex-1 font-display-semibold text-[17px] text-foreground"
          style={parent !== null ? { textAlign: 'center' } : undefined}
        >
          {title || info.title}
        </Text>
        {actions ? (
          <View className="flex-row items-center gap-2">{actions}</View>
        ) : parent !== null ? (
          // Sem ações, um vazio do tamanho do "voltar" mantém o título no centro.
          <View className="w-11" />
        ) : null}
      </View>
    </View>
  );
}

/**
 * Botão-ícone das ações da barra: o `.ib` do canvas, igual ao "voltar" (44 × 44,
 * cantos 14 px, fundo `bg-card`). Para o verde de criar, `headerButtonClass('lime')`.
 */
export const TOP_BAR_ACTION = headerButtonClass();

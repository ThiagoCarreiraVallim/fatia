import type { ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOP_BAR_HEIGHT, TopBar, useTopBarVisible } from './top-bar';
import { useBottomChrome, useChromeScrollHandler } from './bottom-nav';
import { screenBottomPadding } from './bottom-space';
import { colors } from '@/theme/colors';
import { dockedActionBottom, dockedActionReserve } from '@fatia/api-client';

/**
 * Moldura das telas autenticadas.
 *
 * Reserva o espaço da bottom nav e da barra de topo — as duas são `absolute`,
 * e sem o padding o conteúdo passa por baixo delas. O Início não tem barra no
 * topo: só a área segura e um respiro, como o `pt-4` do `<main>` do PWA.
 *
 * `onRefresh` liga o pull-to-refresh, que a #123 pede como ganho nativo e que o
 * PWA não tem.
 */
export function Screen({
  children,
  title,
  onBack,
  actions,
  onRefresh,
  refreshing = false,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  /** Só para tela dinâmica (nome do plano…); o título fixo vem do mapa de rotas. */
  title?: string;
  /** Intercepta a seta de voltar — ver `TopBar`. */
  onBack?: () => void;
  /** Botões à direita na barra de topo. */
  actions?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Desligue quando a tela tiver a própria lista rolável (FlatList). */
  scroll?: boolean;
  /**
   * O botão de ação preso embaixo (Al-T6 "Novo plano", Al-T7 "Iniciar", Al-T19
   * "Criar plano"): 14 px acima da barra, ou a 22 px do fim sem ela. O conteúdo
   * reserva o espaço dele para o último item não ficar atrás.
   */
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const comBarra = useTopBarVisible();
  const paddingTop = insets.top + (comBarra ? TOP_BAR_HEIGHT : 16);
  // Com a barra do treino em andamento, mais a altura dela para nada ficar atrás.
  const chrome = useBottomChrome();
  const dock = { navVisible: chrome.visible, workoutBar: chrome.workoutBar };
  const paddingBottom = footer
    ? insets.bottom + dockedActionReserve(dock)
    : screenBottomPadding({
        safeBottom: insets.bottom,
        navVisible: chrome.visible,
        workoutBar: chrome.workoutBar,
      });
  // A barra de abas desce ao rolar e volta ao subir ou parar (item 4).
  const onScroll = useChromeScrollHandler();
  const body = scroll ? (
    <Animated.ScrollView
      className="flex-1"
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={{ paddingTop, paddingBottom }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryText}
            colors={[colors.primaryText]}
            progressViewOffset={paddingTop}
          />
        ) : undefined
      }
    >
      {children}
    </Animated.ScrollView>
  ) : (
    <View className="flex-1" style={{ paddingTop, paddingBottom }}>
      {children}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {body}
      {footer ? (
        <View
          style={{ bottom: insets.bottom + dockedActionBottom(dock) }}
          className="absolute inset-x-4 flex-row items-center gap-2"
        >
          {footer}
        </View>
      ) : null}
      <TopBar title={title} onBack={onBack} actions={actions} />
    </View>
  );
}

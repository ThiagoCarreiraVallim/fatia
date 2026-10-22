import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOP_BAR_HEIGHT, TopBar, useTopBarVisible } from './top-bar';
import { cores } from '@/theme/cores';

/** A altura da `BottomNav` (80) e um respiro: o "+" mora dentro dela. */
const RESPIRO_INFERIOR = 96;

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
}) {
  const insets = useSafeAreaInsets();
  const comBarra = useTopBarVisible();
  const paddingTop = insets.top + (comBarra ? TOP_BAR_HEIGHT : 16);
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingTop, paddingBottom: RESPIRO_INFERIOR }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={cores.primary}
            colors={[cores.primary]}
            progressViewOffset={paddingTop}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1" style={{ paddingTop, paddingBottom: RESPIRO_INFERIOR }}>
      {children}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {body}
      <TopBar title={title} onBack={onBack} actions={actions} />
    </View>
  );
}

import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOP_BAR_HEIGHT, TopBar } from './top-bar';

/**
 * A nav (80) e mais o "+" global, que flutua acima dela à direita
 * (`registro-rapido.tsx`): sem os 32 a mais, o último card ficava sob o botão.
 */
const RESPIRO_INFERIOR = 128;

/**
 * Moldura das telas autenticadas.
 *
 * Reserva o espaço da bottom nav e, nas telas internas, da barra de voltar — as
 * duas são `absolute`, e sem o padding o conteúdo passa por baixo delas. As
 * telas principais não têm barra no topo: só a área segura e um respiro, como
 * o `pt-4` do `<main>` do PWA.
 *
 * `onRefresh` liga o pull-to-refresh, que a #123 pede como ganho nativo e que o
 * PWA não tem.
 */
export function Screen({
  children,
  back = false,
  title,
  onBack,
  onRefresh,
  refreshing = false,
  scroll = true,
}: {
  children: ReactNode;
  back?: boolean;
  title?: string;
  /** Intercepta a seta de voltar — ver `TopBar`. */
  onBack?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Desligue quando a tela tiver a própria lista rolável (FlatList). */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + (back ? TOP_BAR_HEIGHT : 16);
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
            tintColor="#2ce500"
            colors={['#2ce500']}
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
      <TopBar back={back} title={title} onBack={onBack} />
    </View>
  );
}

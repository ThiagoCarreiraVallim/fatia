import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { TopBar } from './top-bar';

/**
 * Moldura das telas autenticadas.
 *
 * Reserva o espaço da top bar e da bottom nav — as duas são `absolute`, como no
 * PWA, e sem o padding o conteúdo passa por baixo delas. O PWA resolve isso com
 * `pt-16 pb-24` no `<main>`; aqui é o mesmo, só que uma vez só.
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
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingTop: 64, paddingBottom: 96 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2ce500"
            colors={['#2ce500']}
            progressViewOffset={64}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1" style={{ paddingTop: 64, paddingBottom: 96 }}>
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

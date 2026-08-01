import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { cn } from './utils';

/**
 * Tabs controladas, com a mesma API do Radix usada no PWA
 * (`<Tabs value onValueChange>` + `TabsList`/`TabsTrigger`/`TabsContent`).
 *
 * Implementação própria em vez de `@react-navigation/material-top-tabs`: aquele
 * pacote traz `react-native-pager-view` (mais um módulo nativo) e gesto de
 * arrastar entre abas. Aqui as abas são um seletor de filtro dentro da tela —
 * arrastar entre elas competiria com o scroll vertical da lista.
 */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> precisa estar dentro de <Tabs>`);
  return ctx;
}

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <View className={className}>{children}</View>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  children,
  scrollable = false,
}: {
  className?: string;
  children: ReactNode;
  /** Para conjuntos longos (grupos musculares, por exemplo). */
  scrollable?: boolean;
}) {
  const content = (
    <View
      accessibilityRole="tablist"
      className={cn('flex-row items-center gap-1 rounded-lg bg-muted p-1', className)}
    >
      {children}
    </View>
  );
  if (!scrollable) return content;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useTabs('TabsTrigger');
  const active = ctx.value === value;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => ctx.onValueChange(value)}
      className={cn(
        'min-h-[40px] flex-1 items-center justify-center rounded-md px-3 py-2',
        active && 'bg-background',
        className,
      )}
    >
      {typeof children === 'string' ? (
        <Text
          className={cn(
            'text-sm font-medium',
            active ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useTabs('TabsContent');
  if (ctx.value !== value) return null;
  return <View className={cn('mt-3', className)}>{children}</View>;
}

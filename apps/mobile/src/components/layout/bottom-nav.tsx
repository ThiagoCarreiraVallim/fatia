import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Apple, Dumbbell, Home, Menu, Plus } from 'lucide-react-native';
import { PRIMARY_TABS, activeNavKey } from '@fatia/api-client';
import { DrawerLayer } from '@/components/ui';
import { cn } from '@/components/ui/utils';
import { MenuMais } from './menu-mais';
import { useRegistroRapido } from './registro-rapido';
import { cores } from '@/theme/cores';

const ICONE = { home: Home, nutrition: Apple, workout: Dumbbell } as const;

/**
 * Equivalente de `apps/web/src/components/layout/app-nav.tsx`: Início ·
 * Nutrição · [ + ] · Treino · Mais, de `@fatia/api-client`.
 *
 * O "+" no centro é o Registrar — o registro a um toque de qualquer tela, que
 * é o que o plano Free tem no lugar da IA. "Mais" abre o menu com o resto.
 */
export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const registro = useRegistroRapido();
  const [menuAberto, setMenuAberto] = useState(false);
  const ativa = activeNavKey(pathname);

  const aba = (key: 'home' | 'nutrition' | 'workout') => {
    const tab = PRIMARY_TABS.find((t) => t.key === key)!;
    const Icone = ICONE[key];
    const acesa = ativa === key;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: acesa }}
        onPress={() => router.navigate(tab.href)}
        className="min-h-[44px] flex-1 items-center justify-center gap-1 py-2"
      >
        <Icone size={20} color={acesa ? cores.primary : cores.mutedForeground} />
        <Text
          className={cn('text-[11px]', acesa ? 'font-bold text-primary' : 'text-muted-foreground')}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <View
        accessibilityRole="tablist"
        // A barra de gestos do Android e a home indicator do iPhone comem a base
        // da tela. Sem o inset, o último item fica sob o gesto de voltar e o toque
        // vira navegação do sistema.
        style={{ paddingBottom: insets.bottom }}
        className="absolute inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-white/10 bg-muted"
      >
        <View className="h-20 flex-row items-center justify-around px-1">
          {aba('home')}
          {aba('nutrition')}
          <View className="flex-1 items-center justify-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Registrar"
              onPress={registro.abrir}
              style={{ elevation: 6 }}
              className="h-14 w-14 items-center justify-center rounded-full bg-primary active:opacity-80"
            >
              <Plus size={28} strokeWidth={2.5} color={cores.background} />
            </Pressable>
          </View>
          {aba('workout')}
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="Mais"
            accessibilityState={{ selected: ativa === 'more', expanded: menuAberto }}
            onPress={() => setMenuAberto(true)}
            className="min-h-[44px] flex-1 items-center justify-center gap-1 py-2"
          >
            <Menu size={20} color={ativa === 'more' ? cores.primary : cores.mutedForeground} />
            <Text
              className={cn(
                'text-[11px]',
                ativa === 'more' ? 'font-bold text-primary' : 'text-muted-foreground',
              )}
            >
              Mais
            </Text>
          </Pressable>
        </View>
      </View>
      <DrawerLayer>
        <MenuMais aberto={menuAberto} onFechar={() => setMenuAberto(false)} />
      </DrawerLayer>
    </>
  );
}

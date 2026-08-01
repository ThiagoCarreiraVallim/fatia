import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { Apple, Dumbbell, Home, TrendingUp, User } from 'lucide-react-native';
import { cn } from '@/components/ui/utils';

/**
 * Equivalente de `apps/web/src/components/layout/bottom-nav.tsx`.
 *
 * Os cinco destinos e a ordem são os mesmos — inclusive o Dashboard no centro,
 * que é onde o polegar alcança primeiro.
 */
const NAV_ITEMS = [
  { href: '/progress', label: 'Progresso', icon: TrendingUp },
  { href: '/nutrition', label: 'Nutrição', icon: Apple },
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/workout', label: 'Treino', icon: Dumbbell },
  { href: '/profile', label: 'Perfil', icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      // A barra de gestos do Android e a home indicator do iPhone comem a base
      // da tela. Sem o inset, o último item fica sob o gesto de voltar e o toque
      // vira navegação do sistema.
      style={{ paddingBottom: insets.bottom }}
      className="absolute inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-white/10 bg-muted"
    >
      <View className="h-20 flex-row items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Pressable
              key={href}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => router.navigate(href)}
              className="min-h-[44px] flex-1 items-center justify-center gap-1 py-2"
            >
              <Icon size={18} color={active ? '#2ce500' : '#baccaf'} />
              <Text
                className={cn(
                  'text-[10px]',
                  active ? 'font-bold text-primary' : 'text-muted-foreground',
                )}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

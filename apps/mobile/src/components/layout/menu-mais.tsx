import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ClipboardList,
  Flag,
  FlaskConical,
  History,
  MessageCircle,
  Plug,
  Target,
  TrendingUp,
  Trophy,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { menuSections, usersApi, type MenuIcon } from '@fatia/api-client';
import { Drawer, DrawerHeader, DrawerScrollView, DrawerTitle } from '@/components/ui';
import { cores } from '@/theme/cores';

const ICONE: Record<MenuIcon, LucideIcon> = {
  progress: TrendingUp,
  records: Trophy,
  'daily-goals': Target,
  'personal-goals': Flag,
  profile: User,
  foods: UtensilsCrossed,
  nutrients: FlaskConical,
  plans: ClipboardList,
  history: History,
  chat: MessageCircle,
  connect: Plug,
};

/**
 * Réplica do menu "Mais" do PWA: todas as telas que não estão na barra, nas
 * mesmas seções (`menuSections` do api-client). O app não tem chat, então a
 * seção IA leva só a "Conectar sua IA".
 */
export function MenuMais({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const router = useRouter();
  const eu = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const secoes = menuSections({ platform: 'mobile', chatAvailable: false });

  const ir = (href: string) => {
    onFechar();
    router.push(href as never);
  };

  return (
    <Drawer open={aberto} onOpenChange={(v) => !v && onFechar()} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle>Menu</DrawerTitle>
      </DrawerHeader>
      {/* Lista no próprio sheet (sem `DrawerContent`): ver `new-goal-drawer`. */}
      <DrawerScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Perfil de ${eu.data?.name ?? 'você'}`}
          onPress={() => ir('/profile')}
          className="mx-4 mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <Text className="text-base font-bold text-primary">
              {(eu.data?.name ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground">{eu.data?.name ?? ''}</Text>
            <Text className="text-xs text-muted-foreground">Ver perfil</Text>
          </View>
          <ChevronRight size={18} color={cores.mutedForeground} />
        </Pressable>
        {secoes.map((secao) => (
          <View key={secao.title} className="mb-4 gap-1 px-4">
            <Text
              accessibilityRole="header"
              className="px-1 pb-1 text-xs font-bold uppercase text-muted-foreground"
            >
              {secao.title}
            </Text>
            {secao.items.map((item) => {
              const Icone = ICONE[item.key];
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                  accessibilityHint={item.description}
                  onPress={() => ir(item.href)}
                  className="min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-card"
                >
                  <Icone size={20} color={cores.primary} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-foreground">{item.label}</Text>
                    <Text className="text-xs text-muted-foreground">{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </DrawerScrollView>
    </Drawer>
  );
}

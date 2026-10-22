import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  ClipboardList,
  Crown,
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
import { getChatAvailability, menuSections, usersApi, type MenuIcon } from '@fatia/api-client';
import { Drawer, DrawerHeader, DrawerScrollView, DrawerTitle } from '@/components/ui';
import { ChatHero, useChatMenuItem } from './chat-hero';
import { cores } from '@/theme/cores';

const ICON: Record<MenuIcon, LucideIcon> = {
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
  plan: Crown,
};

/**
 * Réplica do menu "Mais" do PWA: todas as telas que não estão na barra, nas
 * mesmas seções (`menuSections` do api-client). O chat aparece quando a
 * instância tem o assistente (Fase 9e), como na web.
 *
 * Diferença deliberada: no celular o chat sai da lista e vira o primeiro
 * cartão do menu, grande. No meio da seção "IA" ele era uma linha igual a
 * "Meu plano", e é a porta de entrada mais rápida do app para registrar
 * qualquer coisa — merece estar a um toque do "Mais", sem rolar. O mesmo
 * cartão abre o drawer do "+" (`quick-add.tsx`).
 */
export function MoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const chat = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  });
  const chatItem = useChatMenuItem();
  const sections = menuSections({
    platform: 'mobile',
    chatAvailable: chat.data?.available ?? false,
    chatLocked: chat.data ? chat.data.available && !chat.data.allowed : false,
  });

  const listed = sections
    .map((section) => ({ ...section, items: section.items.filter((i) => i.key !== 'chat') }))
    .filter((section) => section.items.length > 0);

  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle>Menu</DrawerTitle>
      </DrawerHeader>
      {/* Lista no próprio sheet (sem `DrawerContent`): ver `new-goal-drawer`. */}
      <DrawerScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {chatItem ? <ChatHero item={chatItem} onPress={() => go(chatItem.href)} /> : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Perfil de ${me.data?.name ?? 'você'}`}
          onPress={() => go('/profile')}
          className="mx-4 mb-4 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <Text className="text-base font-bold text-primary">
              {(me.data?.name ?? '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground">{me.data?.name ?? ''}</Text>
            <Text className="text-xs text-muted-foreground">Ver perfil</Text>
          </View>
          <ChevronRight size={18} color={cores.mutedForeground} />
        </Pressable>
        {listed.map((section) => (
          <View key={section.title} className="mb-4 gap-1 px-4">
            <Text
              accessibilityRole="header"
              className="px-1 pb-1 text-xs font-bold uppercase text-muted-foreground"
            >
              {section.title}
            </Text>
            {section.items.map((item) => {
              const Icon = ICON[item.key];
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="link"
                  accessibilityLabel={item.label}
                  accessibilityHint={item.description}
                  onPress={() => go(item.href)}
                  className="min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-card"
                >
                  <Icon size={20} color={cores.primary} />
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

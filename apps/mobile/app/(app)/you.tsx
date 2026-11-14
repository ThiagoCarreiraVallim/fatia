import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Crown,
  Flag,
  FlaskConical,
  History,
  Lock,
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
import { Screen } from '@/components/layout/screen';
import { useChatAvailability } from '@/components/layout/use-ai-state';
import { colors } from '@/theme/colors';

const ICON: Record<MenuIcon, LucideIcon> = {
  progress: TrendingUp,
  records: Trophy,
  'daily-goals': Target,
  'personal-goals': Flag,
  profile: User,
  notifications: Bell,
  foods: UtensilsCrossed,
  nutrients: FlaskConical,
  plans: ClipboardList,
  history: History,
  chat: MessageCircle,
  connect: Plug,
  plan: Crown,
};

/**
 * A aba Você (ADR 040 revisada) — réplica de `apps/web/src/app/(app)/you/page.tsx`:
 * o que era o menu "Mais" (Progresso, metas, perfil, registros, a IA e o
 * plano), nas seções de `menuSections`, até a #387 redesenhar a tela. Os
 * avisos são a linha "Notificações" (ADR 040, item 4); o sino fica no topo do Hoje.
 */
export default function YouScreen() {
  const router = useRouter();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const chat = useChatAvailability().data;
  const sections = menuSections({
    platform: 'mobile',
    chatAvailable: chat?.available ?? false,
    chatLocked: chat ? chat.available && !chat.allowed : false,
  });
  const name = me.data?.name ?? '';

  return (
    <Screen>
      <View className="gap-6 px-5 pb-4 pt-2">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Perfil de ${name || 'você'}`}
          onPress={() => router.push('/profile')}
          className="min-h-14 flex-row items-center gap-3 rounded-3xl bg-card px-4 py-3"
        >
          <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Text className="font-display text-base text-foreground">
              {(name || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className="font-sans-bold text-base text-foreground">
              {name}
            </Text>
            <Text className="text-xs text-muted-foreground">Ver perfil</Text>
          </View>
          <ChevronRight size={18} color={colors.mutedForeground} />
        </Pressable>

        {sections.map((section) => (
          <View key={section.title} className="gap-1">
            <Text
              accessibilityRole="header"
              className="px-1 pb-1 text-xs font-bold uppercase text-muted-foreground"
            >
              {section.title}
            </Text>
            {section.items.map((item) => {
              const ItemIcon = ICON[item.key];
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="link"
                  accessibilityLabel={
                    item.locked ? `${item.label} (exige o plano PRO)` : item.label
                  }
                  accessibilityHint={item.description}
                  onPress={() => router.push(item.href as never)}
                  className="min-h-14 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-card"
                >
                  <ItemIcon size={20} color={colors.primaryText} />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-sm font-semibold text-foreground">{item.label}</Text>
                      {item.locked ? <Lock size={12} color={colors.mutedForeground} /> : null}
                    </View>
                    <Text className="text-xs text-muted-foreground">{item.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </Screen>
  );
}

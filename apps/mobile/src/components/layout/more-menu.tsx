import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ChevronRight,
  ClipboardList,
  Crown,
  Flag,
  FlaskConical,
  History,
  MessageCircle,
  Plug,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import {
  getChatAvailability,
  menuSections,
  usersApi,
  type MenuIcon,
  type MenuItem,
} from '@fatia/api-client';
import { Drawer, DrawerHeader, DrawerScrollView, DrawerTitle } from '@/components/ui';
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
 * qualquer coisa — merece estar a um toque do "Mais", sem rolar.
 */
export function MoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const chat = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  });
  const sections = menuSections({
    platform: 'mobile',
    chatAvailable: chat.data?.available ?? false,
    chatLocked: chat.data ? chat.data.available && !chat.data.allowed : false,
  });

  const chatItem = sections.flatMap((section) => section.items).find((i) => i.key === 'chat');
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

/** Largura da faixa de brilho que atravessa o cartão. */
const SHINE_WIDTH = 90;

/**
 * O cartão do chat: gradiente verde da marca e uma faixa de brilho que passa
 * de tempos em tempos. O brilho é o que o diferencia de "mais um cartão" no
 * menu — e some para quem pediu ao sistema para reduzir animações.
 */
function ChatHero({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const [width, setWidth] = useState(0);
  // `useState` e não `useRef`: o valor animado é lido no render (interpolação).
  const [shine] = useState(() => new Animated.Value(0));
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shine, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, shine, width]);

  const translateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-SHINE_WIDTH * 2, width + SHINE_WIDTH],
  });

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.label}
      accessibilityHint={item.locked ? 'Disponível no plano PRO' : item.description}
      onPress={onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="mx-4 mb-4 overflow-hidden rounded-3xl border border-primary active:opacity-90"
      style={{
        shadowColor: cores.primary,
        shadowOpacity: 0.45,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      }}
    >
      <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id="chatHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={cores.primary} stopOpacity="0.38" />
            <Stop offset="0.6" stopColor={cores.primary} stopOpacity="0.1" />
            <Stop offset="1" stopColor={cores.card} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#chatHero)" />
      </Svg>

      {reduceMotion ? null : (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -40,
            bottom: -40,
            width: SHINE_WIDTH,
            backgroundColor: 'rgba(255,255,255,0.14)',
            transform: [{ translateX }, { rotate: '20deg' }],
          }}
        />
      )}

      <View className="flex-row items-center gap-4 px-5 py-6">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary">
          <Sparkles size={28} color={cores.primaryForeground} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-lg font-extrabold text-foreground">{item.label}</Text>
            {item.locked ? (
              <View className="flex-row items-center gap-1 rounded-full bg-background/60 px-2 py-0.5">
                <Crown size={12} color={cores.warning} />
                <Text className="text-[10px] font-extrabold text-warning">PRO</Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-0.5 text-sm text-foreground/80">{item.description}</Text>
        </View>
        <ChevronRight size={22} color={cores.primary} />
      </View>
    </Pressable>
  );
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

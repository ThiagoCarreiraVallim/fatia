import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ChevronRight, Crown, Sparkles } from 'lucide-react-native';
import { getChatAvailability, menuSections, type MenuItem } from '@fatia/api-client';
import { cores } from '@/theme/cores';

/**
 * O item do chat como o menu o monta (`menuSections`): ausente quando a
 * instância não tem a IA, com cadeado e indo para o plano quando a pessoa é
 * Free. O cartão grande aparece no "Mais" e no "+", e os dois precisam
 * concordar sobre isso.
 */
export function useChatMenuItem(): MenuItem | undefined {
  const chat = useQuery({
    queryKey: ['chat', 'availability'],
    queryFn: getChatAvailability,
    staleTime: 5 * 60_000,
  });
  return menuSections({
    platform: 'mobile',
    chatAvailable: chat.data?.available ?? false,
    chatLocked: chat.data ? chat.data.available && !chat.data.allowed : false,
  })
    .flatMap((section) => section.items)
    .find((item) => item.key === 'chat');
}

/** Largura da faixa de brilho que atravessa o cartão. */
const SHINE_WIDTH = 90;

/**
 * O cartão do chat: gradiente verde da marca e uma faixa de brilho que passa
 * de tempos em tempos. O brilho é o que o diferencia de "mais um cartão" no
 * menu — e some para quem pediu ao sistema para reduzir animações.
 */
export function ChatHero({ item, onPress }: { item: MenuItem; onPress: () => void }) {
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

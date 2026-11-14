import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { aiFabLabel } from '@fatia/api-client';
import { Icon } from '@/components/ui';
import { colors } from '@/theme/colors';
import { useReducedMotion } from '@/theme/motion';
import { useChatSnapshot } from '@/chat/chat-provider';
import { useAiDrawer } from './ai-drawer';
import { aiLocked, aiUsable, useAiPendingCount, useChatAvailability } from './use-ai-state';

/** O anel gira enquanto alguma conversa pensa; com "reduzir movimento", fica parado. */
function ThinkingRing() {
  const reduced = useReducedMotion();
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      pointerEvents="none"
      testID="ai-fab-ring"
      style={{
        position: 'absolute',
        top: -6,
        left: -6,
        right: -6,
        bottom: -6,
        borderRadius: 999,
        borderWidth: 2.5,
        borderColor: reduced ? colors.primary : 'transparent',
        borderTopColor: colors.primary,
        borderRightColor: colors.primary,
        transform: reduced ? [] : [{ rotate }],
      }}
    />
  );
}

/**
 * O botão redondo da IA, à direita da barra — o `ai-fab.tsx` do PWA. Abre o
 * menu "O que vamos registrar?"; anel e selo são visuais e o nome acessível
 * diz o mesmo (`aiFabLabel`).
 */
export function AiFab() {
  const drawer = useAiDrawer();
  const availability = useChatAvailability().data;
  const usable = aiUsable(availability);
  const pending = useAiPendingCount(usable).data;
  // A resposta que segue chegando nesta sessão (ADR 035) também liga o anel: o
  // contador do servidor só é relido no fim do turno. O anel substitui o antigo
  // aviso "Respondendo…" acima da barra.
  const local = useChatSnapshot();
  const streaming = local.thread.running && Boolean(local.conversationId);
  const state = {
    thinking: streaming || (pending?.thinking ?? 0) > 0,
    waiting: pending?.waiting ?? 0,
  };
  const label = aiFabLabel(state, { locked: aiLocked(availability) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: drawer.isOpen }}
      onPress={drawer.open}
      style={{ elevation: 8 }}
      className="h-[68px] w-[68px] items-center justify-center rounded-full bg-primary active:opacity-80"
    >
      {state.thinking ? <ThinkingRing /> : null}
      <Icon name="spark" size={28} color={colors.primaryForeground} />
      {state.waiting > 0 ? (
        <View
          testID="ai-fab-badge"
          pointerEvents="none"
          className="absolute -right-1 -top-1 h-6 min-w-[24px] items-center justify-center rounded-full bg-foreground px-1.5"
          style={{ borderWidth: 3, borderColor: colors.background }}
        >
          <Text className="font-sans-bold text-xs text-background">{state.waiting}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

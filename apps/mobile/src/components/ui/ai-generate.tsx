import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AI_GENERATE_DRAFT_NOTE,
  AI_GENERATE_ERROR,
  aiGenerateLabel,
  type AiGenerateState,
} from '@fatia/api-client';
import { duration } from '@fatia/design';
import { colors } from '@/theme/colors';
import { Badge } from './badge';
import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';
import { cn } from './utils';

/** Pulsa enquanto `active`; com "reduzir movimento" fica parado. */
function usePulse(active: boolean) {
  const v = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(v);
      v.value = 1;
      return;
    }
    v.value = withRepeat(
      withTiming(0.45, { duration: duration.breathe / 2, reduceMotion: ReduceMotion.System }),
      -1,
      true,
      undefined,
      ReduceMotion.System,
    );
  }, [active, v]);
  return useAnimatedStyle(() => ({ opacity: v.value }));
}

/**
 * "Gerar com IA" (prancha Componentes-plano · 1.7), espelho do
 * `ai-generate.tsx` da web: linhas pulsando no lugar do conteúdo enquanto
 * gera, o botão respira só nesse estado, e o resultado entra como rascunho.
 */
export function AiGenerate({
  title,
  state,
  onGenerate,
  lines = 3,
  children,
  className,
}: {
  title: string;
  state: AiGenerateState;
  onGenerate: () => void;
  lines?: number;
  children?: ReactNode;
  className?: string;
}) {
  const generating = state === 'generating';
  const pulse = usePulse(generating);
  return (
    <View
      accessibilityLabel={title}
      accessibilityState={{ busy: generating }}
      className={cn('gap-3', className)}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="flex-1 font-display text-h3 text-foreground">
          {title}
        </Text>
        <Animated.View style={generating ? pulse : undefined}>
          <Button size="sm" disabled={generating} onPress={onGenerate} className="opacity-100">
            <Icon name="spark" size={16} color={colors.primaryForeground} />
            <Text className="font-sans-bold text-sm text-primary-foreground">
              {aiGenerateLabel(state)}
            </Text>
          </Button>
        </Animated.View>
      </View>
      {generating ? (
        <View accessibilityLabel="Gerando o rascunho" className="gap-2">
          {Array.from({ length: lines }, (_, i) => (
            <Animated.View
              key={i}
              className="h-4 rounded-chip bg-surface-3"
              style={[{ width: `${92 - i * 14}%` }, pulse]}
            />
          ))}
        </View>
      ) : (
        <>
          {state === 'draft' ? (
            <View className="flex-row items-center gap-2">
              <Badge variant="pending">Rascunho</Badge>
              <Text className="flex-1 text-b2 text-muted-foreground">{AI_GENERATE_DRAFT_NOTE}</Text>
            </View>
          ) : null}
          {state === 'error' ? (
            <Text accessibilityRole="alert" className="text-b2 text-danger">
              {AI_GENERATE_ERROR}
            </Text>
          ) : null}
          {children}
        </>
      )}
    </View>
  );
}

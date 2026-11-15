import { View } from 'react-native';
import { proBlockCopy, type ProBlockState } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';

/**
 * Bloco PRO (prancha PRO · 9 estados), espelho do `pro-block.tsx` da web: o
 * estado vem de `proBlockState` e o texto de `proBlockCopy`, os dois no
 * api-client. Verde só no selo; nunca a cor da comunidade. No iOS sem compra,
 * `canPurchase` falso troca a oferta por "Tenho um código".
 */
export function ProBlock({
  state,
  canPurchase = true,
  onAction,
  className,
}: {
  state: ProBlockState;
  canPurchase?: boolean;
  onAction?: () => void;
  className?: string;
}) {
  const copy = proBlockCopy(state, canPurchase);
  const attention = copy.tone === 'attention';
  return (
    <View
      accessibilityLabel="Plano"
      className={cn(
        'gap-3 rounded-card bg-card p-5',
        attention && 'border-[1.5px] border-warning/60',
        className,
      )}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-field',
            attention ? 'bg-warning/15' : 'bg-primary',
          )}
        >
          <Icon
            name={attention ? 'clock' : 'crown'}
            size={20}
            color={attention ? colors.warning : colors.primaryForeground}
          />
        </View>
        <Text accessibilityRole="header" className="flex-1 font-display text-lg text-foreground">
          {copy.title}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">{copy.body}</Text>
      {copy.action && onAction ? (
        <Button variant={copy.tone === 'positive' ? 'secondary' : 'default'} onPress={onAction}>
          {copy.action}
        </Button>
      ) : null}
    </View>
  );
}

/** A versão de uma linha, para o topo do chat, as folhas e o Você. */
export function ProBlockCompact({
  state,
  canPurchase = true,
  onAction,
}: {
  state: ProBlockState;
  canPurchase?: boolean;
  onAction?: () => void;
}) {
  const copy = proBlockCopy(state, canPurchase);
  return (
    <View className="flex-row items-center gap-3 rounded-field bg-card px-4 py-3">
      <Icon name="crown" size={18} color={colors.primaryText} />
      <Text numberOfLines={1} className="min-w-0 flex-1 font-sans-semibold text-sm text-foreground">
        {copy.title}
      </Text>
      {copy.action && onAction ? (
        <Button variant="link" size="sm" onPress={onAction}>
          {copy.action}
        </Button>
      ) : null}
    </View>
  );
}

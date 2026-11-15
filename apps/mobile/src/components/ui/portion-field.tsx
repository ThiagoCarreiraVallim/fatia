import { Pressable, View } from 'react-native';
import { formatQuantity, gramsFor, stepQuantity } from '@fatia/api-client';
import { colors } from '@/theme/colors';
import { cn } from './utils';
import { Icon } from './icon';
import { Text } from './text';

/**
 * Campo de porção (prancha Componentes · Campos: "1½ = 37,5 g"), espelho do
 * `portion-field.tsx` da web, com as regras de porção do api-client.
 */
export function PortionField({
  quantity,
  portionGrams,
  onChange,
  label,
  className,
}: {
  quantity: number;
  portionGrams: number;
  onChange: (quantity: number) => void;
  /** O nome da porção, para o leitor de tela ("colher de sopa"). */
  label: string;
  className?: string;
}) {
  const grams = gramsFor(portionGrams, quantity).toLocaleString('pt-BR');
  return (
    <View className={cn('flex-row items-center gap-1.5 rounded-field bg-muted p-1', className)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Menos ${label}`}
        onPress={() => onChange(stepQuantity(quantity, -1))}
        className="h-11 w-11 items-center justify-center rounded-[12px] bg-card active:opacity-80"
      >
        <Text className="font-display text-xl text-foreground">−</Text>
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${formatQuantity(quantity)} ${label}, ${grams} g`}
        className="min-w-14 flex-1 text-center font-display text-lg text-foreground"
      >
        {formatQuantity(quantity)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mais ${label}`}
        onPress={() => onChange(stepQuantity(quantity, 1))}
        className="h-11 w-11 items-center justify-center rounded-[12px] bg-primary active:opacity-80"
      >
        <Icon name="plus" size={20} color={colors.primaryForeground} />
      </Pressable>
      <Text className="ml-auto pr-3 text-b2 text-muted-foreground">= {grams} g</Text>
    </View>
  );
}

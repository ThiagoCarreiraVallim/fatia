import { Pressable, View } from 'react-native';
import { Text } from './text';
import { lightHaptic } from '@/theme/motion';
import { cn } from './utils';

/**
 * Controles de seleção do DS v2 (prancha Componentes · Seleção), os mesmos da
 * web (`apps/web/src/components/ui/selection.tsx`). Cada um diz ao leitor de
 * tela o papel e o estado; o toque dá o retorno leve (`lightHaptic`).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nome do grupo para o leitor de tela. */
  label: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cn('flex-row gap-1 rounded-field bg-muted p-1', className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on }}
            onPress={() => {
              if (on) return;
              lightHaptic();
              onChange(o.value);
            }}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-[12px]',
              on && 'bg-card',
            )}
          >
            <Text
              className={cn(
                'text-sm',
                on ? 'font-sans-bold text-foreground' : 'font-sans-semibold text-muted-foreground',
              )}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      hitSlop={8}
      onPress={() => {
        lightHaptic();
        onCheckedChange(!checked);
      }}
      className={cn(
        'h-[30px] w-[52px] justify-center rounded-pill px-[3px]',
        checked ? 'items-end bg-primary' : 'items-start bg-surface-3',
      )}
    >
      <View className="h-6 w-6 rounded-pill bg-white" />
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-9 items-center justify-center rounded-pill px-4',
        selected ? 'bg-foreground' : 'bg-card',
      )}
    >
      <Text
        className={cn(
          'font-sans-semibold text-[13px]',
          selected ? 'text-background' : 'text-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FEELINGS } from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';

/**
 * As cinco carinhas do canvas (Leve … No limite), a mesma escala do RPE 6–10.
 * Serve à série ("Como foi a série?") e ao treino ("Como foi o treino?").
 * Tocar no escolhido desmarca: a resposta é opcional.
 */
export function FeelingPicker({
  value,
  onChange,
  title,
  compact,
}: {
  value: number | null;
  onChange: (level: number | null) => void;
  title?: string;
  compact?: boolean;
}) {
  const selected = FEELINGS.find((f) => f.level === value) ?? null;
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={title}>
      {title ? (
        <View className="flex-row items-baseline justify-between">
          <Text className="font-sans-bold text-sm text-foreground">{title}</Text>
          {selected && !compact ? (
            <Text className="text-[12px] text-muted-foreground">{selected.hint}</Text>
          ) : null}
        </View>
      ) : null}
      <View className="flex-row gap-1.5">
        {FEELINGS.map((f) => {
          const on = f.level === value;
          return (
            <Pressable
              key={f.level}
              accessibilityRole="radio"
              accessibilityLabel={`${f.label}, ${f.hint}`}
              accessibilityState={{ selected: on }}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(on ? null : f.level);
              }}
              className={cn(
                'min-h-[52px] flex-1 items-center justify-center rounded-2xl',
                on ? 'bg-primary' : 'bg-muted',
              )}
            >
              <Text className="text-[22px]">{f.emoji}</Text>
              {compact ? null : (
                <Text
                  numberOfLines={1}
                  className={cn(
                    'text-[10px] font-sans-bold',
                    on ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {f.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

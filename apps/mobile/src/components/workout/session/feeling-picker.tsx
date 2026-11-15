import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FEELINGS } from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { colors } from '@/theme/colors';

/**
 * As cinco carinhas do canvas (Leve … No limite), a mesma escala do RPE 6–10.
 * Serve à série ("Como foi a série?") e ao treino ("Como foi o treino?").
 * Tocar no escolhido desmarca: a resposta é opcional.
 *
 * Como nas pranchas `Al-T3` e `Al-T5`: só a carinha no botão; na série, a
 * pergunta vira o nome da escolha ("Leve · sobravam 4 ou mais"); no treino, o
 * título fica e a escolha ganha o contorno verde.
 */
export function FeelingPicker({
  value,
  onChange,
  title,
  compact,
  variant = 'set',
}: {
  value: number | null;
  onChange: (level: number | null) => void;
  title?: string;
  compact?: boolean;
  variant?: 'set' | 'workout';
}) {
  const selected = FEELINGS.find((f) => f.level === value) ?? null;
  const heading =
    variant === 'set' && selected ? `${selected.label} · ${selected.hint}` : (title ?? null);
  return (
    <View className="gap-2.5" accessibilityRole="radiogroup" accessibilityLabel={title}>
      {heading ? (
        <Text
          className={
            variant === 'workout'
              ? 'font-display-semibold text-[17px] text-foreground'
              : 'text-[15px] text-foreground/80'
          }
        >
          {heading}
        </Text>
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
                'flex-1 items-center justify-center',
                compact ? 'h-11 rounded-xl' : 'h-14 rounded-2xl',
                on ? '' : 'bg-muted',
              )}
              style={
                on
                  ? {
                      backgroundColor: `${colors.primary}29`,
                      borderWidth: 2,
                      borderColor: colors.primary,
                    }
                  : undefined
              }
            >
              <Text className={compact ? 'text-xl' : 'text-[26px]'}>{f.emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

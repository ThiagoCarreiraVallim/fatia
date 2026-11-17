import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { dayLabel, logDayTitle, shiftDay } from '@fatia/api-client';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/progress/log-day-field.tsx`: dia de um
 * registro novo de água, peso ou passos.
 *
 * Só setas, como em `CopiarParaDia`: o caso comum é ontem, a um toque, e o app
 * não carrega dependência de date picker por isso. Amanhã fica travado aqui e na
 * API.
 */
export function SeletorDeDia({
  dia,
  hoje,
  onChange,
  variant = 'field',
}: {
  dia: string;
  hoje: string;
  onChange: (dia: string) => void;
  /** `nav`: a linha da folha Peso/Passos (Al-G7): ‹ "Hoje · 4 nov" ›. */
  variant?: 'field' | 'nav';
}) {
  const noLimite = dia >= hoje;
  if (variant === 'nav') {
    return (
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dia anterior"
          onPress={() => onChange(shiftDay(dia, -1))}
          className="h-11 w-11 items-center justify-center rounded-[14px] bg-muted"
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text
          accessibilityLiveRegion="polite"
          className="flex-1 text-center font-sans-bold text-[15px] text-foreground"
        >
          {logDayTitle(dia, hoje)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo dia"
          accessibilityState={{ disabled: noLimite }}
          disabled={noLimite}
          onPress={() => onChange(shiftDay(dia, 1))}
          className={`h-11 w-11 items-center justify-center rounded-[14px] bg-muted ${noLimite ? 'opacity-40' : ''}`}
        >
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-foreground">Dia</Text>
      <View className="flex-row items-center justify-between rounded-md border border-border p-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dia anterior"
          onPress={() => onChange(shiftDay(dia, -1))}
          className="h-11 w-11 items-center justify-center rounded-md active:bg-accent"
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text className="text-sm font-medium capitalize text-foreground">
          {dayLabel(dia, hoje)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo dia"
          accessibilityState={{ disabled: noLimite }}
          disabled={noLimite}
          onPress={() => onChange(shiftDay(dia, 1))}
          className={`h-11 w-11 items-center justify-center rounded-md active:bg-accent ${noLimite ? 'opacity-40' : ''}`}
        >
          <ChevronRight size={20} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

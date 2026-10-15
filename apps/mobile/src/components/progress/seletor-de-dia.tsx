import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { dayLabel, shiftDay } from '@fatia/api-client';
import { cores } from '@/theme/cores';

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
}: {
  dia: string;
  hoje: string;
  onChange: (dia: string) => void;
}) {
  const noLimite = dia >= hoje;
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
          <ChevronLeft size={20} color={cores.foreground} />
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
          <ChevronRight size={20} color={cores.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

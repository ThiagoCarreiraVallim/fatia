import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { ExerciseGroup } from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { setChipLabel } from './guided-session';
import { targetSetsOf } from './format';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { colors } from '@/theme/colors';

/**
 * As séries do exercício como chips (prancha `Al-T3-Sessao`): as feitas com
 * carga × reps e a carinha, a da vez como "agora", as de depois apagadas.
 * Tocar numa feita abre o "Corrigir série" logo abaixo.
 */
export function SetChips({
  group,
  editing,
  onEdit,
  onAll,
}: {
  group: ExerciseGroup;
  editing: number | null;
  onEdit: (index: number | null) => void;
  /** "Todas ›": abre o Treino atual (prancha `Al-T17`). */
  onAll?: () => void;
}) {
  const unit = useUnitPrefs().loadUnit;
  const total = Math.max(targetSetsOf(group), group.sets.length);
  const done = group.sets.length;
  return (
    <View className="flex-row items-center gap-1.5">
      <ScrollView
        horizontal
        className="flex-1"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
      >
        {Array.from({ length: total }, (_, i) => {
          const set = group.sets[i];
          const current = !set && i === done;
          const on = editing === i;
          return (
            <Pressable
              key={set?.id ?? `slot-${i}`}
              accessibilityRole={set ? 'button' : 'text'}
              accessibilityLabel={
                set
                  ? `Corrigir série ${i + 1}: ${setChipLabel(set, group.isCardio, unit)}`
                  : current
                    ? `Série ${i + 1}, agora`
                    : `Série ${i + 1}, ainda não feita`
              }
              accessibilityState={set ? { expanded: on } : undefined}
              disabled={!set}
              onPress={() => onEdit(on ? null : i)}
              className={cn(
                'h-10 flex-row items-center gap-1.5 rounded-full px-3',
                set && on && 'bg-primary',
                current && 'border-[1.5px] border-foreground',
                !set && !current && 'bg-muted',
              )}
              style={set && !on ? { backgroundColor: `${colors.primary}29` } : undefined}
            >
              <Text
                className={cn(
                  'text-[13px] font-sans-bold opacity-60',
                  on ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {i + 1}
              </Text>
              <Text
                numberOfLines={1}
                className={cn(
                  'text-[13px] font-sans-bold',
                  on
                    ? 'text-primary-foreground'
                    : set || current
                      ? 'text-foreground'
                      : 'text-faint',
                )}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {set ? setChipLabel(set, group.isCardio, unit) : current ? 'agora' : '—'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {onAll ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Todas as séries: abrir o Treino atual"
          onPress={onAll}
          className="h-10 flex-row items-center gap-1 rounded-full bg-muted px-3 active:opacity-80"
        >
          <Text className="font-sans-bold text-[13px] text-foreground">Todas</Text>
          <ChevronRight size={16} color={colors.foreground} />
        </Pressable>
      ) : null}
    </View>
  );
}

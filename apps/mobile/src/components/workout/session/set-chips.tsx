import { Pressable, ScrollView } from 'react-native';
import type { ExerciseGroup } from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { setChipLabel } from './guided-session';
import { targetSetsOf } from './format';

/**
 * As séries do exercício como chips (prancha `Al-T3-Sessao`): as feitas com
 * carga × reps e a carinha, a da vez como "agora", as de depois apagadas.
 * Tocar numa feita abre o "Corrigir série" logo abaixo.
 */
export function SetChips({
  group,
  editing,
  onEdit,
}: {
  group: ExerciseGroup;
  editing: number | null;
  onEdit: (index: number | null) => void;
}) {
  const total = Math.max(targetSetsOf(group), group.sets.length);
  const done = group.sets.length;
  return (
    <ScrollView
      horizontal
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
                ? `Corrigir série ${i + 1}: ${setChipLabel(set, group.isCardio)}`
                : current
                  ? `Série ${i + 1}, agora`
                  : `Série ${i + 1}, ainda não feita`
            }
            accessibilityState={set ? { expanded: on } : undefined}
            disabled={!set}
            onPress={() => onEdit(on ? null : i)}
            className={cn(
              'min-h-[44px] min-w-[64px] items-center justify-center rounded-2xl px-3',
              set && on && 'bg-primary',
              set && !on && 'bg-primary/20',
              current && 'border-[1.5px] border-foreground',
              !set && !current && 'bg-muted',
            )}
          >
            <Text
              className={cn(
                'text-[10px] font-sans-bold',
                on ? 'text-primary-foreground' : 'text-muted-foreground',
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
                    : 'text-muted-foreground',
              )}
            >
              {set ? setChipLabel(set, group.isCardio) : current ? 'agora' : '—'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

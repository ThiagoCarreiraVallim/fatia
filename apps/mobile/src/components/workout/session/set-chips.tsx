import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { currentChipIndex, revealOffset, type ExerciseGroup } from '@fatia/api-client';
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
  const currentIndex = currentChipIndex({ done, target: targetSetsOf(group) });

  // O chip da vez sempre à vista (pedido do dono): na série 4 de 4 a faixa
  // mostrava só os dois primeiros. As medidas chegam pelo `onLayout`; quando o
  // chip da vez se mede (ele muda de "agora" para a série feita a cada
  // registro), a faixa rola o mínimo para ele caber.
  const scrollRef = useRef<ScrollView>(null);
  const measure = useRef({ offset: 0, viewport: 0, content: 0 });
  const chips = useRef(new Map<number, { x: number; width: number }>());
  function reveal() {
    const chip = currentIndex != null ? chips.current.get(currentIndex) : undefined;
    const m = measure.current;
    if (!chip || m.viewport === 0) return;
    const x = revealOffset({
      offset: m.offset,
      viewport: m.viewport,
      content: m.content,
      itemStart: chip.x,
      itemEnd: chip.x + chip.width,
      margin: 16,
    });
    if (x !== m.offset) scrollRef.current?.scrollTo({ x, animated: true });
  }
  // Ao abrir a sessão já na série 4, as medidas chegam antes de o ScrollView
  // aceitar `scrollTo`; uma segunda tentativa depois do primeiro quadro garante.
  useEffect(() => {
    const t = setTimeout(reveal, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, total]);

  return (
    <View className="flex-row items-center gap-1.5">
      <ScrollView
        ref={scrollRef}
        horizontal
        className="flex-1"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          measure.current.offset = e.nativeEvent.contentOffset.x;
        }}
        onLayout={(e) => {
          measure.current.viewport = e.nativeEvent.layout.width;
          reveal();
        }}
        onContentSizeChange={(width) => {
          measure.current.content = width;
          reveal();
        }}
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
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                chips.current.set(i, { x, width });
                if (i === currentIndex) reveal();
              }}
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

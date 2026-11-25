import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  dayNutrientBar,
  dayNutrientRangeText,
  dayNutrientStatusText,
  formatNutrientAmount,
  type DayNutrient,
} from '@fatia/api-client';
import { Icon, Text, cn } from '@/components/ui';
import { TABULAR, todayCard, toneSoft } from '@/components/today/parts';
import { centeredScrollX } from '@/components/ui/scroll-into-view';
import { colors } from '@/theme/colors';

const MACROS = ['protein_g', 'carbs_g', 'fat_g'];
/** A chave do chip "Todos" na faixa (nenhum nutriente tem chave vazia). */
const ALL = '';

const number = (n: DayNutrient) => formatNutrientAmount(n.value, '').trim();

/**
 * O dia em faixas (prancha Al-N1), espelho de
 * `apps/web/src/components/nutrition/day-nutrients-card.tsx`: "Todos" mostra
 * calorias, macros e os micronutrientes com meta; um chip mostra só aquele, com
 * o estado escrito, nunca só a cor.
 */
export function DayNutrientsCard({
  nutrients,
  selected,
  onSelect,
}: {
  nutrients: DayNutrient[];
  /** Chave do nutriente escolhido; `null` é "Todos". */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const router = useRouter();
  const one = selected ? nutrients.find((n) => n.key === selected) : undefined;
  const kcal = nutrients.find((n) => n.key === 'kcal');
  const macros = nutrients.filter((n) => MACROS.includes(n.key));
  const micros = nutrients.filter((n) => n.key !== 'kcal' && !MACROS.includes(n.key));

  // O chip escolhido rola para o meio da faixa (#478): tocar num micro lá do fim
  // do cartão escolhe um chip que estava fora da tela.
  const chips = useRef<ScrollView>(null);
  const chipLayouts = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const content = useRef(0);
  const activeKey = one?.key ?? ALL;
  const scrollToActive = (animated: boolean) => {
    const layout = chipLayouts.current.get(activeKey);
    if (!layout || !viewport.current) return;
    const x = centeredScrollX(layout, viewport.current, content.current);
    chips.current?.scrollTo({ x, animated });
  };
  useEffect(() => {
    scrollToActive(true);
    // Só a troca de chip rola; as medidas chegam pelos `onLayout`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  return (
    <View className="gap-3">
      <ScrollView
        ref={chips}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Até a borda da tela (#477): a Nutrição tem `px-5`.
        className="-mx-5"
        contentContainerClassName="gap-1.5 px-5"
        accessibilityLabel="Nutriente"
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.width;
        }}
        onContentSizeChange={(w) => {
          content.current = w;
        }}
      >
        {[{ key: ALL, label: 'Todos' }, ...nutrients].map((n) => (
          <NutrientChip
            key={n.key}
            label={n.label}
            selected={activeKey === n.key}
            onPress={() => onSelect(n.key === ALL ? null : n.key)}
            onLayout={(layout) => {
              chipLayouts.current.set(n.key, layout);
              // Chegou a medida do chip ativo (ex.: voltou com um micro escolhido).
              if (n.key === activeKey) scrollToActive(false);
            }}
          />
        ))}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Adicionar nutriente"
          onPress={() => router.push('/nutrition/nutrient-targets')}
          className="h-9 flex-row items-center gap-1.5 rounded-chip border border-border-strong px-3.5"
        >
          <Icon name="plus" size={16} color={colors.mutedForeground} />
          <Text className="font-sans-semibold text-sm text-muted-foreground">Nutriente</Text>
        </Pressable>
      </ScrollView>

      {one ? (
        <OneNutrient n={one} />
      ) : (
        <View className={cn(todayCard, 'gap-4 p-[18px]')}>
          {kcal ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${kcal.label}, ${formatNutrientAmount(kcal.value, kcal.unit)}`}
              onPress={() => onSelect('kcal')}
              className="gap-2"
            >
              <View className="flex-row items-end justify-between gap-3">
                <View className="flex-row items-baseline gap-1.5">
                  <Text
                    style={[TABULAR, { fontSize: 40, lineHeight: 44, letterSpacing: -1.2 }]}
                    className="font-display"
                  >
                    {number(kcal)}
                  </Text>
                  <Text className="text-sm text-muted-foreground">kcal</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-muted-foreground">faixa do dia</Text>
                  <Text style={TABULAR} className="font-sans-bold text-sm">
                    {dayNutrientRangeText(kcal)}
                  </Text>
                </View>
              </View>
              <RangeBar n={kcal} tall />
            </Pressable>
          ) : null}
          {macros.length > 0 ? (
            <View className="flex-row gap-3.5 border-t border-border pt-3.5">
              {macros.map((n) => (
                <NutrientCell key={n.key} n={n} onSelect={onSelect} />
              ))}
            </View>
          ) : null}
          {micros.length > 0 ? (
            <View className="flex-row flex-wrap gap-3.5 border-t border-border pt-3.5">
              {micros.map((n) => (
                <NutrientCell key={n.key} n={n} onSelect={onSelect} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function NutrientCell({ n, onSelect }: { n: DayNutrient; onSelect: (key: string) => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${n.label}, ${formatNutrientAmount(n.value, n.unit)}`}
      onPress={() => onSelect(n.key)}
      className="min-h-11 min-w-[28%] flex-1 gap-1.5"
    >
      <Text numberOfLines={1} className="text-xs text-muted-foreground">
        {n.label}
      </Text>
      <Text style={TABULAR} className="font-sans-bold text-base">
        {number(n)}
        <Text className="text-xs text-muted-foreground"> {n.unit}</Text>
      </Text>
      <RangeBar n={n} />
      <Text style={TABULAR} className="text-[11px] text-muted-foreground">
        {dayNutrientRangeText(n)}
      </Text>
    </Pressable>
  );
}

function OneNutrient({ n }: { n: DayNutrient }) {
  const router = useRouter();
  const bar = dayNutrientBar(n);
  const isGoal = n.key === 'kcal' || MACROS.includes(n.key);
  const hasGoal = bar.lo != null || bar.hi != null;
  return (
    <View className={todayCard}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm text-muted-foreground">{n.label}</Text>
        <View
          className="rounded-pill px-2.5 py-0.5"
          style={{ backgroundColor: n.status === 'ok' ? toneSoft('lime') : colors.surface3 }}
        >
          <Text
            className={cn(
              'font-sans-semibold text-xs',
              n.status === 'over'
                ? 'text-destructive'
                : n.status === 'ok'
                  ? 'text-primary'
                  : 'text-foreground',
            )}
          >
            {dayNutrientStatusText(n)}
          </Text>
        </View>
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-row items-baseline gap-1.5">
          <Text style={TABULAR} className="font-display text-d3">
            {number(n)}
          </Text>
          <Text className="text-sm text-muted-foreground">{n.unit}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-muted-foreground">
            {n.min != null && n.max != null ? 'faixa do dia' : n.min != null ? 'mínimo' : 'limite'}
          </Text>
          <Text style={TABULAR} className="font-sans-bold text-sm">
            {dayNutrientRangeText(n)}
          </Text>
        </View>
      </View>
      <RangeBar n={n} tall />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(isGoal ? '/nutrition/goals' : '/nutrition/nutrient-targets')}
        className="min-h-11 flex-row items-center gap-1 self-start"
      >
        <Text className="font-sans-semibold text-sm text-primary">
          {hasGoal ? 'Ajustar meta' : 'Definir meta'}
        </Text>
        <Icon name="chevR" size={16} color={colors.primaryText} />
      </Pressable>
    </View>
  );
}

/** A cor de cada nutriente, como na prancha (`N` do script de Al-N1). */
export function nutrientColor(key: string): string {
  const map: Record<string, string> = {
    kcal: colors.primary,
    protein_g: colors.protein,
    carbs_g: colors.carbs,
    fat_g: colors.fat,
    fiber_g: colors.water,
    sodium_mg: colors.steps,
    caffeine_mg: colors.mutedForeground,
  };
  return map[key] ?? colors.primary;
}

/** Chip de filtro da prancha: 36 px, raio de chip, texto apagado até ser escolhido. */
function NutrientChip({
  label,
  selected,
  onPress,
  onLayout,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  onLayout: (layout: { x: number; width: number }) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout)}
      className={cn(
        'h-9 items-center justify-center rounded-chip px-3.5',
        selected ? 'bg-foreground' : 'bg-card',
      )}
    >
      <Text
        className={cn(
          'font-sans-semibold text-sm',
          selected ? 'text-background' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Barra com a faixa marcada por trás do preenchido e um traço em cada ponta dela. */
function RangeBar({ n, tall = false }: { n: DayNutrient; tall?: boolean }) {
  const bar = dayNutrientBar(n);
  const lo = bar.lo ?? 0;
  const hi = bar.hi ?? 100;
  const color = nutrientColor(n.key);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className={cn('w-full', tall ? 'h-3' : 'h-1.5')}
    >
      <View className="absolute inset-0 overflow-hidden rounded-pill bg-surface-3">
        {bar.lo != null || bar.hi != null ? (
          <View
            className="absolute bottom-0 top-0"
            style={{
              left: `${lo}%`,
              width: `${Math.max(0, hi - lo)}%`,
              backgroundColor: color,
              opacity: 0.22,
            }}
          />
        ) : null}
        <View
          className="absolute bottom-0 left-0 top-0 rounded-pill"
          style={{
            width: `${bar.fill}%`,
            backgroundColor: n.status === 'over' ? colors.destructive : color,
          }}
        />
      </View>
      {[bar.lo, bar.hi].map((at, i) =>
        at == null ? null : (
          <View
            key={i}
            className="absolute w-0.5 rounded-[1px] bg-foreground"
            style={{ left: `${at}%`, top: -3, bottom: -3, marginLeft: -1 }}
          />
        ),
      )}
    </View>
  );
}

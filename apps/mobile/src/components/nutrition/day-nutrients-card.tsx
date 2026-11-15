import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  dayNutrientBar,
  dayNutrientRangeText,
  dayNutrientStatusText,
  formatNutrientAmount,
  type DayNutrient,
} from '@fatia/api-client';
import { Chip, Icon, Text, cn } from '@/components/ui';
import { TABULAR, todayCard, toneSoft } from '@/components/today/parts';
import { colors } from '@/theme/colors';

const MACROS = ['protein_g', 'carbs_g', 'fat_g'];

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

  return (
    <View className="gap-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1.5"
        accessibilityLabel="Nutriente"
      >
        <Chip label="Todos" selected={!one} onPress={() => onSelect(null)} />
        {nutrients.map((n) => (
          <Chip
            key={n.key}
            label={n.label}
            selected={one?.key === n.key}
            onPress={() => onSelect(n.key)}
          />
        ))}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Adicionar nutriente"
          onPress={() => router.push('/nutrition/nutrient-targets')}
          className="min-h-9 flex-row items-center gap-1 rounded-pill border border-dashed border-border px-4"
        >
          <Icon name="plus" size={16} color={colors.mutedForeground} />
          <Text className="font-sans-semibold text-[13px] text-muted-foreground">Nutriente</Text>
        </Pressable>
      </ScrollView>

      {one ? (
        <OneNutrient n={one} />
      ) : (
        <View className={todayCard}>
          {kcal ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${kcal.label}, ${formatNutrientAmount(kcal.value, kcal.unit)}`}
              onPress={() => onSelect('kcal')}
              className="gap-2"
            >
              <View className="flex-row items-end justify-between gap-3">
                <View className="flex-row items-baseline gap-1.5">
                  <Text style={TABULAR} className="font-display text-d3">
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
              <RangeBar n={kcal} />
            </Pressable>
          ) : null}
          {macros.length > 0 ? (
            <View className="flex-row gap-3">
              {macros.map((n) => (
                <NutrientCell key={n.key} n={n} onSelect={onSelect} />
              ))}
            </View>
          ) : null}
          {micros.length > 0 ? (
            <View className="flex-row flex-wrap gap-3 border-t border-border pt-3">
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
      className="min-h-11 min-w-[28%] flex-1 gap-1"
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

/** Barra com a faixa marcada por trás do preenchido. */
function RangeBar({ n, tall = false }: { n: DayNutrient; tall?: boolean }) {
  const bar = dayNutrientBar(n);
  const lo = bar.lo ?? 0;
  const hi = bar.hi ?? 100;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className={cn('w-full overflow-hidden rounded-pill bg-surface-3', tall ? 'h-3' : 'h-1.5')}
    >
      {bar.lo != null || bar.hi != null ? (
        <View
          className="absolute bottom-0 top-0"
          style={{
            left: `${lo}%`,
            width: `${Math.max(0, hi - lo)}%`,
            backgroundColor: `${colors.primary}33`,
          }}
        />
      ) : null}
      <View
        className="absolute bottom-0 left-0 top-0 rounded-pill"
        style={{
          width: `${bar.fill}%`,
          backgroundColor: n.status === 'over' ? colors.destructive : colors.primary,
        }}
      />
    </View>
  );
}

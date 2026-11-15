import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter, type Href } from 'expo-router';
import {
  formatDecimal,
  formatInteger,
  nextWorkoutCopy,
  nextWorkoutDetail,
  personalGoalProgress,
  rotuloDeSequencia,
  stepsTargetShort,
  weightChange30dLabel,
  type Goal,
  type NextEvent,
  type ReceivedPlan,
  type TodaySummary,
  type TodoItem,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { Ring } from '@/components/ui/data-blocks';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { horaDoDia } from '@/components/dashboard/helpers';
import { colors } from '@/theme/colors';
import { listEntering } from '@/theme/motion';
import { Bar, ChipIcon, Eyebrow, TABULAR, todayCard, todayTile } from './parts';

/**
 * Os cartões da aba Hoje (prancha Al-H1-Hoje), espelho de
 * `apps/web/src/components/today/today-cards.tsx`, na ordem da prancha. Cartão
 * de dado que ainda não existe (pedido da equipe, treino recebido, evento) não
 * é desenhado: some sem deixar buraco.
 */

const TODO_ICON = { assessment: 'ruler', plan_offer: 'dumbbell', questionnaire: 'review' } as const;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function useGo() {
  const router = useRouter();
  return (href: string) => router.push(href as Href);
}

/** "Novo treino da Helena": faixa verde com "Ver". */
export function ReceivedPlanBanner({ plan }: { plan: ReceivedPlan }) {
  const go = useGo();
  return (
    <Animated.View entering={listEntering(0)}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${plan.title}. ${plan.subtitle}`}
        onPress={() => go(plan.href)}
        className="flex-row items-center gap-3 rounded-card px-4 py-3.5"
        style={{ backgroundColor: `${colors.primary}24` }}
      >
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `${colors.protein}33` }}
        >
          <Text className="font-display text-[11px]" style={{ color: colors.protein }}>
            {initials(plan.fromName)}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-bold text-foreground">{plan.title}</Text>
          <Text className="text-b2 text-muted-foreground">{plan.subtitle}</Text>
        </View>
        <View className="h-[34px] items-center justify-center rounded-chip bg-primary px-3.5">
          <Text className="text-[13px] font-bold text-primary-foreground">Ver</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** "Para fazer": pedidos da equipe, com a contagem na cor da comunidade. */
export function TodoCard({ todo }: { todo: { count: number; items: TodoItem[] } }) {
  const go = useGo();
  return (
    <Animated.View entering={listEntering(1)} className={cn(todayCard, 'gap-1.5 px-4 pb-2 pt-3.5')}>
      <View className="min-h-8 flex-row items-center gap-2">
        <Text accessibilityRole="header" className="text-[15px] font-bold text-foreground">
          Para fazer
        </Text>
        <View className="h-[22px] items-center justify-center rounded-pill bg-brand px-2">
          <Text className="text-[11px] font-extrabold text-brand-foreground">{todo.count}</Text>
        </View>
      </View>
      {todo.items.map((item) => (
        <Pressable
          key={`${item.kind}-${item.id}`}
          accessibilityRole="link"
          accessibilityLabel={`${item.title}. ${item.subtitle}`}
          onPress={() => go(item.href)}
          className="min-h-12 flex-row items-center gap-3 border-t border-border py-2"
        >
          <ChipIcon icon={TODO_ICON[item.kind]} tone="brand" size={34} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {item.title}
            </Text>
            <Text numberOfLines={1} className="text-xs text-faint">
              {item.subtitle}
            </Text>
          </View>
          <Icon name="chevR" size={16} color={colors.faintForeground} />
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** Evento do dia: "Vou" antes da aula; depois, "Foi?" e registrar a aula. */
export function EventCard({ event }: { event: NextEvent }) {
  const go = useGo();
  if (event.past) {
    return (
      <Animated.View
        entering={listEntering(1)}
        className={cn(todayCard, 'gap-2.5 px-4 py-3.5')}
        style={{ borderWidth: 1.5, borderColor: colors.primary }}
      >
        <View className="flex-row items-center gap-3">
          <ChipIcon icon="cal" tone="lime" />
          <View className="min-w-0 flex-1">
            <Text className="font-bold text-foreground">{event.title}</Text>
            <Text className="text-b2 text-muted-foreground">Você marcou Vou. Foi?</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => go(event.href)}
          className="h-[52px] items-center justify-center rounded-field bg-primary"
        >
          <Text className="text-[15px] font-bold text-primary-foreground">
            Registrar a aula{event.durationMin ? ` · ${event.durationMin} min` : ''}
          </Text>
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={listEntering(1)}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${event.title}. ${event.subtitle}${event.going ? '. Vou' : ''}`}
        onPress={() => go(event.href)}
        className={cn(todayCard, 'flex-row items-center gap-3 px-4 py-3.5')}
        style={{ borderWidth: 1.5, borderColor: colors.brand }}
      >
        <ChipIcon icon="cal" tone="brand" />
        <View className="min-w-0 flex-1">
          <Text className="font-bold text-foreground">{event.title}</Text>
          <Text className="text-b2 text-muted-foreground">{event.subtitle}</Text>
        </View>
        {event.going ? (
          <View className="h-[22px] items-center justify-center rounded-pill bg-brand px-2.5">
            <Text className="text-[11px] font-extrabold uppercase text-brand-foreground">Vou</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function mid(min: number, max: number) {
  return Math.round((min + max) / 2);
}

/** Calorias que restam no anel e as três barras de macro. Leva ao dia de Nutrição. */
export function KcalCard({ nutrition }: { nutrition: TodaySummary['nutrition'] }) {
  const go = useGo();
  const { consumed, goals } = nutrition;
  const target = goals ? mid(goals.kcalMin, goals.kcalMax) : 0;
  const remaining = Math.max(0, target - Math.round(consumed.kcal));
  const macros = [
    {
      label: 'Prot',
      cur: consumed.proteinG,
      tgt: goals ? mid(goals.proteinMinG, goals.proteinMaxG) : 0,
      color: colors.protein,
    },
    {
      label: 'Carb',
      cur: consumed.carbsG,
      tgt: goals ? mid(goals.carbsMinG, goals.carbsMaxG) : 0,
      color: colors.carbs,
    },
    {
      label: 'Gord',
      cur: consumed.fatG,
      tgt: goals ? mid(goals.fatMinG, goals.fatMaxG) : 0,
      color: colors.fat,
    },
  ];
  return (
    <Animated.View entering={listEntering(1)}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={
          goals
            ? `Nutrição: restam ${formatInteger(remaining)} kcal`
            : `Nutrição: ${formatInteger(consumed.kcal)} kcal hoje`
        }
        onPress={() => go('/nutrition')}
        className={cn(todayCard, 'flex-row items-center gap-[18px]')}
      >
        <Ring
          value={goals ? Math.round(consumed.kcal) : 0}
          max={target || 1}
          size={132}
          stroke={13}
          label={goals ? 'restam' : 'kcal hoje'}
        >
          <Text style={TABULAR} className="font-display text-d3 text-foreground">
            {formatInteger(goals ? remaining : consumed.kcal)}
          </Text>
          <Text className="text-xs text-faint">{goals ? 'restam' : 'kcal hoje'}</Text>
        </Ring>
        <View className="min-w-0 flex-1 gap-2">
          {goals ? (
            macros.map((m) => (
              <View key={m.label} className="gap-1">
                <View className="flex-row justify-between">
                  <Text className="text-xs text-faint">{m.label}</Text>
                  <Text style={TABULAR} className="text-xs text-faint">
                    {formatInteger(m.cur)}/{formatInteger(m.tgt)}
                  </Text>
                </View>
                <Bar percent={m.tgt > 0 ? (m.cur / m.tgt) * 100 : 0} color={m.color} />
              </View>
            ))
          ) : (
            <Text className="text-b2 text-muted-foreground">
              Defina suas metas para ver quanto resta de cada macro.
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** O cartão verde do próximo treino, com o play. */
export function NextWorkoutCard({ workout }: { workout: TodaySummary['workout'] }) {
  const go = useGo();
  const copy = nextWorkoutCopy(workout, horaDoDia, {
    sessionHref: (id) => `/workout/session/${id}`,
  });
  const detail =
    !workout.sessionInProgress && !workout.completedToday && workout.nextPlan
      ? (nextWorkoutDetail(workout.nextPlan.exerciseCount ?? null) ?? copy.subtitle)
      : copy.subtitle;
  return (
    <Animated.View entering={listEntering(2)}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${copy.badge}: ${copy.title}. ${detail}`}
        onPress={() => go(copy.href)}
        className={cn(todayCard, 'flex-row items-center gap-3.5 bg-primary py-4 pl-5 pr-4')}
      >
        <View className="min-w-0 flex-1">
          <Eyebrow className="text-primary-foreground">{copy.badge}</Eyebrow>
          <Text numberOfLines={1} className="font-display text-h2 text-primary-foreground">
            {copy.title}
          </Text>
          <Text className="text-[13px] font-semibold text-primary-foreground opacity-75">
            {detail}
          </Text>
        </View>
        <View
          className="h-[52px] w-[52px] items-center justify-center rounded-field"
          style={{ backgroundColor: colors.primaryForeground }}
        >
          <Icon name="play" size={24} color={colors.primary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Água do dia: a gota abre a folha de água; o "+" soma um copo. */
export function WaterTile({
  water,
  onOpen,
  onAdd,
  adding,
}: {
  water: TodaySummary['water'];
  onOpen: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const target = water.targetMl ?? 2500;
  return (
    <Animated.View entering={listEntering(3)} className={todayTile}>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir água"
          onPress={onOpen}
          className="-m-2 h-11 w-11 items-center justify-center"
        >
          <Icon name="drop" size={22} color={colors.water} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Água +250"
          disabled={adding}
          onPress={onAdd}
          hitSlop={4}
          className={cn(
            'h-9 w-9 items-center justify-center rounded-field bg-muted',
            adding && 'opacity-50',
          )}
        >
          <Icon name="plus" size={16} />
        </Pressable>
      </View>
      <Pressable onPress={onOpen} accessible={false}>
        <Text>
          <Text style={TABULAR} className="font-display text-[26px] text-foreground">
            {formatInteger(water.todayMl)}
          </Text>
          <Text className="text-xs text-faint"> /{formatDecimal(target / 1000)} L</Text>
        </Text>
      </Pressable>
      <Bar percent={(water.todayMl / target) * 100} color={colors.water} label="Meta de água" />
    </Animated.View>
  );
}

/** Passos do dia, com o percentual da meta. Abre o registro de passos. */
export function StepsTile({ steps, onOpen }: { steps: TodaySummary['steps']; onOpen: () => void }) {
  const pct = steps.target ? Math.min(100, Math.round((steps.today / steps.target) * 100)) : null;
  return (
    <Animated.View entering={listEntering(4)} className="flex-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Passos: ${formatInteger(steps.today)}${steps.target ? ` de ${formatInteger(steps.target)}` : ''}`}
        onPress={onOpen}
        className={todayTile}
      >
        <View className="flex-row items-center justify-between">
          <Icon name="steps" size={22} color={colors.steps} />
          {pct !== null ? <Text className="text-xs text-faint">{pct}%</Text> : null}
        </View>
        <Text>
          <Text style={TABULAR} className="font-display text-[26px] text-foreground">
            {formatInteger(steps.today)}
          </Text>
          {steps.target ? (
            <Text className="text-xs text-faint"> {stepsTargetShort(steps.target)}</Text>
          ) : null}
        </Text>
        <Bar percent={pct ?? 0} color={colors.steps} />
      </Pressable>
    </Animated.View>
  );
}

/** Peso mais recente e a variação de 30 dias. Abre a folha de peso. */
export function WeightTile({
  weight,
  onOpen,
}: {
  weight: TodaySummary['weight'];
  onOpen: () => void;
}) {
  const change = weightChange30dLabel(weight.change30dKg);
  return (
    <Animated.View entering={listEntering(5)} className="flex-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          weight.latest
            ? `Peso: ${formatDecimal(weight.latest.weightKg)} kg${change ? `, ${change}` : ''}`
            : 'Registrar peso'
        }
        onPress={onOpen}
        className={todayTile}
      >
        <Icon name="scale" size={22} color={colors.mutedForeground} />
        <Text>
          <Text className="font-display text-[26px] text-foreground">
            {weight.latest ? formatDecimal(weight.latest.weightKg) : '—'}
          </Text>
          <Text className="text-xs text-faint"> kg</Text>
        </Text>
        <Text className={cn('text-xs', change ? 'text-primary' : 'text-faint')}>
          {change ?? (weight.latest ? 'sem variação em 30 dias' : 'registrar peso')}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Sequência de dias ativos. Leva à semana, em Progresso. */
export function StreakTile({ streak }: { streak: TodaySummary['streak'] }) {
  const go = useGo();
  const days = streak.activeDays;
  return (
    <Animated.View entering={listEntering(6)} className="flex-1">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${rotuloDeSequencia(days, 'dias')}. Ver semana`}
        onPress={() => go('/progress')}
        className={todayTile}
      >
        <Icon name="flame" size={22} color={colors.warning} />
        <Text>
          <Text className="font-display text-[26px] text-foreground">
            {days.periodos}
            {days.janelaEsgotada ? '+' : ''}
          </Text>
          <Text className="text-xs text-faint"> {days.periodos === 1 ? 'dia' : 'dias'}</Text>
        </Text>
        <Text className="text-xs text-faint">sequência · ver semana</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Metas pessoais ativas, com o progresso de cada uma. */
export function PersonalGoalsCard({
  goals,
  loading,
}: {
  goals: Goal[] | undefined;
  loading: boolean;
}) {
  const go = useGo();
  const active = goals ?? [];
  return (
    <Animated.View entering={listEntering(7)} className={todayCard}>
      <Pressable
        accessibilityRole="link"
        onPress={() => go('/goals')}
        className="flex-row items-center justify-between"
      >
        <Text accessibilityRole="header" className="text-[15px] font-bold text-foreground">
          Metas pessoais
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs text-faint">
            {loading ? '…' : active.length === 1 ? '1 ativa' : `${active.length} ativas`}
          </Text>
          <Icon name="chevR" size={16} color={colors.faintForeground} />
        </View>
      </Pressable>
      {loading ? (
        <View className="h-10 rounded-field bg-muted" />
      ) : active.length === 0 ? (
        <Pressable accessibilityRole="link" onPress={() => go('/goals')}>
          <Text className="text-b2 text-muted-foreground">Nenhuma meta ativa. Criar uma meta</Text>
        </Pressable>
      ) : (
        active.slice(0, 3).map((g, i) => {
          const p = personalGoalProgress(g);
          return (
            <Pressable
              key={g.id}
              accessibilityRole="link"
              accessibilityLabel={`${g.title}: ${p.text}`}
              onPress={() => go('/goals')}
              className="gap-1.5"
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">
                  {g.title}
                </Text>
                <Text style={TABULAR} className="text-xs text-faint">
                  {p.text}
                </Text>
              </View>
              <Bar percent={p.percent} color={i % 2 === 0 ? colors.primary : colors.protein} />
            </Pressable>
          );
        })
      )}
    </Animated.View>
  );
}

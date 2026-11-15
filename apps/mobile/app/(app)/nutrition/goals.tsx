import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import {
  Calculator,
  ChevronRight,
  Droplet,
  Dumbbell,
  Footprints,
  Minus,
  Plus,
} from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GOAL_RANGES,
  GOAL_STEP,
  goalBand,
  goalsToDraft,
  stepGoalText,
  nutritionApi,
  parseGoalsDraft,
  type GoalErrorKey,
  type GoalsDraft,
  type NutrientProgress,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, LoadingState, cn } from '@/components/ui';
import { NUMEROS_TABULARES, hojeIso, mensagemDeErro } from '@/components/nutrition/helpers';
import { colors } from '@/theme/colors';

/**
 * Metas do dia (prancha Al-N6). Réplica de
 * `apps/web/src/app/(app)/nutrition/goals/page.tsx`: cada meta é uma faixa com
 * mínimo e máximo digitáveis (teclado numérico, vírgula decimal), o erro de
 * mínimo acima do máximo na própria linha, água em litros e o atalho para os
 * nutrientes.
 */

const EMPTY: GoalsDraft = goalsToDraft({
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 250,
  fatMinG: 50,
  fatMaxG: 80,
  weeklyWorkouts: 3,
  dailyStepsTarget: 8000,
  dailyWaterTargetMl: 2500,
});

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export default function NutritionGoalsScreen() {
  const qc = useQueryClient();
  const router = useRouter();
  const goals = useQuery({ queryKey: ['nutrition', 'goals'], queryFn: () => nutritionApi.goals() });
  const [draft, setDraft] = useState<GoalsDraft>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState<Set<GoalErrorKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  // Ajuste durante o render, e não num efeito (#187): a resposta muda de
  // identidade só quando muda de verdade, e o formulário é reespelhado antes de
  // pintar.
  const [previousData, setPreviousData] = useState<typeof goals.data>(undefined);
  if (previousData !== goals.data && goals.data) {
    setPreviousData(goals.data);
    const { userId, ...rest } = goals.data;
    void userId;
    setDraft(goalsToDraft(rest));
  }

  const { goals: parsed, errors } = parseGoalsDraft(draft);
  const errorOf = (key: GoalErrorKey) => (submitted || touched.has(key) ? errors[key] : undefined);

  const save = useMutation({
    mutationFn: (body: NonNullable<typeof parsed>) => nutritionApi.putGoals(body),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['nutrition', 'goals'] });
    },
  });

  const change = (field: keyof GoalsDraft, row: GoalErrorKey) => (value: string) => {
    setSaved(false);
    setTouched((t) => new Set(t).add(row));
    setDraft((d) => ({ ...d, [field]: value }));
  };

  // Enquanto as metas carregam, digitar seria apagado pela resposta.
  const editable = !goals.isLoading;

  return (
    <Screen onRefresh={() => void goals.refetch()} refreshing={goals.isRefetching}>
      <View className="gap-5 px-5 pb-28 pt-2">
        <Text className="text-[13px] text-muted-foreground">
          Cada meta é uma faixa. Ajuste o mínimo e o máximo, cada um na sua linha; dentro dela o dia
          conta como “na meta”.
        </Text>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Recalcular com meus dados"
          onPress={() => router.push('/onboarding?refazer=1')}
          className="min-h-12 flex-row items-center gap-3 rounded-card bg-card px-4 py-3"
        >
          <Calculator size={18} color={colors.primaryText} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">Recalcular com meus dados</Text>
            <Text className="text-xs text-muted-foreground">
              Objetivo, peso e rotina viram uma sugestão de metas.
            </Text>
          </View>
        </Pressable>

        {goals.isLoading ? <LoadingState label="Carregando metas…" /> : null}
        {goals.error ? (
          <ErrorState error={goals.error} onRetry={() => void goals.refetch()} />
        ) : null}

        <View className="gap-3">
          <SectionTitle>Calorias e macros</SectionTitle>
          {GOAL_RANGES.map((r) => {
            const error = errorOf(r.min);
            const keyboard = r.unit === 'kcal' ? 'number-pad' : 'decimal-pad';
            const band = goalBand(draft[r.min], draft[r.max]);
            const color = RANGE_COLOR[r.min];
            return (
              <View key={r.min} className="rounded-card bg-card px-4 pb-1 pt-4">
                <View className="flex-row items-center gap-2.5">
                  <View className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: color }} />
                  <Text
                    accessibilityRole="header"
                    className="flex-1 font-display-semibold text-[17px] text-foreground"
                  >
                    {r.label}
                  </Text>
                  <Text style={NUMEROS_TABULARES} className="font-sans-bold text-sm">
                    {`${draft[r.min] || '—'}–${draft[r.max] || '—'} `}
                    <Text className="font-sans text-sm text-muted-foreground">{r.unit}</Text>
                  </Text>
                </View>
                <View className="relative mt-3 h-2 rounded-pill bg-muted">
                  {band ? (
                    <View
                      className="absolute bottom-0 top-0 rounded-pill"
                      style={{
                        left: `${band.left}%`,
                        width: `${band.width}%`,
                        backgroundColor: color,
                      }}
                    />
                  ) : null}
                </View>
                <StepRow
                  label="Mínimo"
                  hint="abaixo disso falta"
                  a11y={`Mínimo de ${r.label}`}
                  keyboard={keyboard}
                  editable={editable}
                  value={draft[r.min]}
                  error={error}
                  onChange={change(r.min, r.min)}
                  onStep={(d) =>
                    change(r.min, r.min)(stepGoalText(draft[r.min], GOAL_STEP[r.min], d))
                  }
                />
                <StepRow
                  label="Máximo"
                  hint="acima disso passou"
                  a11y={`Máximo de ${r.label}`}
                  keyboard={keyboard}
                  editable={editable}
                  value={draft[r.max]}
                  error={error}
                  onChange={change(r.max, r.min)}
                  onStep={(d) =>
                    change(r.max, r.min)(stepGoalText(draft[r.max], GOAL_STEP[r.max], d))
                  }
                  divider
                />
                {error ? (
                  <Text accessibilityRole="alert" className="pb-3 text-sm text-destructive">
                    {error}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <View className="gap-3">
          <SectionTitle>Água e movimento</SectionTitle>
          <View className="rounded-card bg-card px-4">
            <SingleField
              icon={<Droplet size={20} color={colors.water} />}
              label="Água por dia"
              a11y="Água por dia (L)"
              unit="L"
              hint="conta no anel do Hoje"
              keyboard="decimal-pad"
              editable={editable}
              value={draft.waterL}
              error={errorOf('water')}
              onChange={change('waterL', 'water')}
              onStep={(d) =>
                change('waterL', 'water')(stepGoalText(draft.waterL, GOAL_STEP.waterL, d))
              }
            />
            <SingleField
              icon={<Dumbbell size={20} color={colors.foreground} />}
              label="Treinos por semana"
              unit="dias"
              hint="dias que quer treinar"
              keyboard="number-pad"
              editable={editable}
              value={draft.weeklyWorkouts}
              error={errorOf('workouts')}
              onChange={change('weeklyWorkouts', 'workouts')}
              onStep={(d) =>
                change(
                  'weeklyWorkouts',
                  'workouts',
                )(stepGoalText(draft.weeklyWorkouts, GOAL_STEP.weeklyWorkouts, d))
              }
              divider
            />
            <SingleField
              icon={<Footprints size={20} color={colors.steps} />}
              label="Passos por dia"
              hint="vem do celular"
              keyboard="number-pad"
              editable={editable}
              value={draft.dailyStepsTarget}
              error={errorOf('steps')}
              onChange={change('dailyStepsTarget', 'steps')}
              onStep={(d) =>
                change(
                  'dailyStepsTarget',
                  'steps',
                )(stepGoalText(draft.dailyStepsTarget, GOAL_STEP.dailyStepsTarget, d))
              }
              divider
            />
          </View>
        </View>

        <YourNutrients />

        <Button
          size="xl"
          className="rounded-pill bg-foreground"
          textClassName="text-background"
          onPress={() => {
            setSubmitted(true);
            if (parsed) save.mutate(parsed);
          }}
          disabled={save.isPending}
          loading={save.isPending}
        >
          Salvar metas
        </Button>

        {submitted && !parsed ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            Confira as linhas marcadas antes de salvar.
          </Text>
        ) : null}
        {save.error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {mensagemDeErro(save.error, {
              conflito: 'Suas metas já foram atualizadas.',
              alternativa: 'Não foi possível salvar as metas. Tente de novo.',
            })}
          </Text>
        ) : null}
        {saved && !save.isPending && !save.error ? (
          <Text accessibilityRole="alert" className="text-sm text-primary">
            Metas salvas.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="px-1 text-[13px] text-muted-foreground">
      {children}
    </Text>
  );
}

/** A cor de cada faixa, a mesma do cartão do dia. */
const RANGE_COLOR: Record<(typeof GOAL_RANGES)[number]['min'], string> = {
  kcalMin: colors.foreground,
  proteinMinG: colors.protein,
  carbsMinG: colors.carbs,
  fatMinG: colors.fat,
};

/**
 * "− 1.800 +" da prancha. O número continua um campo: digitar 1.850 é mais
 * rápido que tocar no + várias vezes.
 */
function Stepper({
  a11y,
  keyboard,
  editable,
  value,
  error,
  unit,
  onChange,
  onStep,
}: {
  a11y: string;
  keyboard: 'decimal-pad' | 'number-pad';
  editable: boolean;
  value: string;
  error?: string;
  unit?: string;
  onChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <View className="flex-row items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${a11y}`}
        disabled={!editable}
        onPress={() => onStep(-1)}
        className="h-11 w-11 items-center justify-center rounded-full bg-muted"
      >
        <Minus size={18} color={colors.foreground} />
      </Pressable>
      <View className="w-[72px] flex-row items-baseline justify-center">
        <TextInput
          accessibilityLabel={a11y}
          accessibilityHint={error}
          keyboardType={keyboard}
          editable={editable}
          value={value}
          onChangeText={onChange}
          selectionColor={colors.primaryText}
          style={[
            NUMEROS_TABULARES,
            {
              minWidth: 20,
              padding: 0,
              textAlign: 'center',
              fontSize: 17,
              fontFamily: 'Manrope_700Bold',
              color: error ? colors.destructive : colors.foreground,
            },
          ]}
        />
        {unit ? <Text className="font-sans-bold text-[17px]">{` ${unit}`}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${a11y}`}
        disabled={!editable}
        onPress={() => onStep(1)}
        className="h-11 w-11 items-center justify-center rounded-full bg-muted"
      >
        <Plus size={18} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function StepRow({
  label,
  hint,
  divider = false,
  ...stepper
}: Parameters<typeof Stepper>[0] & { label: string; hint: string; divider?: boolean }) {
  return (
    <View
      className={cn(
        'min-h-[76px] flex-row items-center gap-3 py-3',
        divider ? 'border-t border-border' : 'mt-1',
      )}
    >
      <View className="flex-1">
        <Text className="text-[15px] text-foreground">{label}</Text>
        <Text className="text-[13px] text-muted-foreground">{hint}</Text>
      </View>
      <Stepper {...stepper} />
    </View>
  );
}

function SingleField({
  icon,
  label,
  a11y,
  hint,
  error,
  divider = false,
  ...stepper
}: Omit<Parameters<typeof Stepper>[0], 'a11y'> & {
  icon: React.ReactNode;
  label: string;
  a11y?: string;
  hint: string;
  divider?: boolean;
}) {
  return (
    <View className={cn('py-3', divider && 'border-t border-border')}>
      <View className="min-h-[60px] flex-row items-center gap-3">
        {icon}
        <View className="flex-1">
          <Text className="font-sans-semibold text-[15px] text-foreground">{label}</Text>
          <Text className="text-[13px] text-muted-foreground">{hint}</Text>
        </View>
        <Stepper a11y={a11y ?? label} error={error} {...stepper} />
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="mt-1 text-right text-xs text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** "Seus nutrientes": o resumo de hoje e o atalho para a tela Al-N7. */
function YourNutrients() {
  const router = useRouter();
  const today = hojeIso();
  const q = useQuery({
    queryKey: ['nutrition', 'nutrient-summary', today],
    queryFn: () => nutritionApi.nutrientSummary(today),
  });
  const open = () => router.push('/nutrition/nutrient-targets');
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <SectionTitle>Seus nutrientes</SectionTitle>
        <Pressable
          accessibilityRole="link"
          onPress={open}
          hitSlop={8}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm font-bold text-primary">Gerenciar</Text>
        </Pressable>
      </View>
      <View className="overflow-hidden rounded-card bg-card px-4">
        {q.isLoading ? <LoadingState /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {(q.data?.nutrients ?? []).map((n) => (
          <NutrientLink key={n.nutrientKey} n={n} onPress={open} />
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={open}
          className="min-h-14 flex-row items-center gap-2 py-3"
        >
          <Plus size={18} color={colors.primaryText} />
          <Text className="font-sans-bold text-[15px] text-primary">Adicionar nutriente</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NutrientLink({ n, onPress }: { n: NutrientProgress; onPress: () => void }) {
  const kind =
    n.min != null && n.max == null ? 'mín' : n.max != null && n.min == null ? 'máx' : null;
  const target =
    kind === 'mín'
      ? `${fmt(n.min as number)} ${n.unit}`
      : kind === 'máx'
        ? `${fmt(n.max as number)} ${n.unit}`
        : n.min != null && n.max != null
          ? `${fmt(n.min)}–${fmt(n.max)} ${n.unit}`
          : '—';
  // Abaixo do mínimo hoje: o "MÍN" acende em laranja, como na prancha.
  const short = kind === 'mín' && n.total < (n.min as number);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${n.label}: hoje ${fmt(n.total)} ${n.unit}, ${kind ? `${kind} ` : ''}${target}`}
      onPress={onPress}
      className="min-h-[72px] flex-row items-center gap-3 border-b border-border py-3"
    >
      <View className="flex-1">
        <Text className="font-sans-semibold text-[17px] text-foreground">{n.label}</Text>
        <Text style={NUMEROS_TABULARES} className="text-[13px] text-muted-foreground">
          hoje {fmt(n.total)} {n.unit}
        </Text>
      </View>
      {kind ? (
        <View className={cn('rounded-pill px-2.5 py-0.5', short ? 'bg-warning' : 'bg-muted')}>
          <Text
            className={cn(
              'font-sans-extrabold text-[11px] uppercase',
              short ? 'text-background' : 'text-muted-foreground',
            )}
          >
            {kind}
          </Text>
        </View>
      ) : null}
      <Text style={NUMEROS_TABULARES} className="font-sans-bold text-[17px] text-foreground">
        {target}
      </Text>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useRouter } from 'expo-router';
import { Calculator, ChevronRight, Droplet, Dumbbell, Footprints, Plus } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GOAL_RANGES,
  goalsToDraft,
  nutritionApi,
  parseGoalsDraft,
  type GoalErrorKey,
  type GoalsDraft,
  type NutrientProgress,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, Input, Label, LoadingState } from '@/components/ui';
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
      <View className="gap-5 p-4 pb-28">
        <Text className="text-sm text-muted-foreground">
          Cada meta é uma faixa. Ajuste o mínimo e o máximo; dentro dela o dia conta como “na meta”.
        </Text>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Recalcular com meus dados"
          onPress={() => router.push('/onboarding?refazer=1')}
          className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
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
            return (
              <View key={r.min} className="gap-3 rounded-2xl bg-card p-4">
                <View className="flex-row items-baseline justify-between">
                  <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
                    {r.label}
                  </Text>
                  <Text style={NUMEROS_TABULARES} className="text-sm text-muted-foreground">
                    {draft[r.min] || '—'}–{draft[r.max] || '—'} {r.unit}
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1">
                    <Label>Mínimo</Label>
                    <Input
                      accessibilityLabel={`Mínimo de ${r.label}`}
                      accessibilityHint={error}
                      keyboardType={keyboard}
                      editable={editable}
                      value={draft[r.min]}
                      onChangeText={change(r.min, r.min)}
                      className={error ? 'border-destructive' : undefined}
                    />
                    <Text className="text-[11px] text-muted-foreground">abaixo disso falta</Text>
                  </View>
                  <View className="flex-1 gap-1">
                    <Label>Máximo</Label>
                    <Input
                      accessibilityLabel={`Máximo de ${r.label}`}
                      accessibilityHint={error}
                      keyboardType={keyboard}
                      editable={editable}
                      value={draft[r.max]}
                      onChangeText={change(r.max, r.min)}
                      className={error ? 'border-destructive' : undefined}
                    />
                    <Text className="text-[11px] text-muted-foreground">acima disso passou</Text>
                  </View>
                </View>
                {error ? (
                  <Text accessibilityRole="alert" className="text-sm text-destructive">
                    {error}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <View className="gap-3">
          <SectionTitle>Água e movimento</SectionTitle>
          <View className="rounded-2xl bg-card">
            <SingleField
              icon={<Droplet size={18} color={colors.water} />}
              label="Água por dia (L)"
              hint="conta no anel do Hoje"
              keyboard="decimal-pad"
              editable={editable}
              value={draft.waterL}
              error={errorOf('water')}
              onChange={change('waterL', 'water')}
            />
            <SingleField
              icon={<Dumbbell size={18} color={colors.mutedForeground} />}
              label="Treinos por semana"
              hint="dias que quer treinar"
              keyboard="number-pad"
              editable={editable}
              value={draft.weeklyWorkouts}
              error={errorOf('workouts')}
              onChange={change('weeklyWorkouts', 'workouts')}
              divider
            />
            <SingleField
              icon={<Footprints size={18} color={colors.primaryText} />}
              label="Passos por dia"
              hint="vem do celular"
              keyboard="number-pad"
              editable={editable}
              value={draft.dailyStepsTarget}
              error={errorOf('steps')}
              onChange={change('dailyStepsTarget', 'steps')}
              divider
            />
          </View>
        </View>

        <YourNutrients />

        <Button
          size="xl"
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
    <Text
      accessibilityRole="header"
      className="text-xs font-bold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </Text>
  );
}

function SingleField({
  icon,
  label,
  hint,
  keyboard,
  editable,
  value,
  error,
  onChange,
  divider = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  keyboard: 'decimal-pad' | 'number-pad';
  editable: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  divider?: boolean;
}) {
  return (
    <View className={divider ? 'border-t border-border px-4 py-3' : 'px-4 py-3'}>
      <View className="flex-row items-center gap-3">
        {icon}
        <View className="flex-1">
          <Text className="text-sm font-bold text-foreground">{label}</Text>
          <Text className="text-xs text-muted-foreground">{hint}</Text>
        </View>
        <View className="w-28">
          <Input
            accessibilityLabel={label}
            accessibilityHint={error}
            keyboardType={keyboard}
            editable={editable}
            value={value}
            onChangeText={onChange}
            style={NUMEROS_TABULARES}
            className={error ? 'border-destructive text-right' : 'text-right'}
          />
        </View>
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
      <View className="overflow-hidden rounded-2xl bg-card">
        {q.isLoading ? <LoadingState /> : null}
        {q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {(q.data?.nutrients ?? []).map((n) => (
          <NutrientLink key={n.nutrientKey} n={n} onPress={open} />
        ))}
        <Pressable
          accessibilityRole="link"
          onPress={open}
          className="min-h-12 flex-row items-center gap-2 border-t border-border px-4 py-3"
        >
          <Plus size={16} color={colors.primaryText} />
          <Text className="text-sm font-bold text-primary">Adicionar nutriente</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NutrientLink({ n, onPress }: { n: NutrientProgress; onPress: () => void }) {
  const target =
    n.min != null && n.max == null
      ? `mín ${fmt(n.min)} ${n.unit}`
      : n.max != null && n.min == null
        ? `máx ${fmt(n.max)} ${n.unit}`
        : n.min != null && n.max != null
          ? `${fmt(n.min)}–${fmt(n.max)} ${n.unit}`
          : '—';
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${n.label}: hoje ${fmt(n.total)} ${n.unit}, ${target}`}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-3"
    >
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground">{n.label}</Text>
        <Text style={NUMEROS_TABULARES} className="text-xs text-muted-foreground">
          hoje {fmt(n.total)} {n.unit}
        </Text>
      </View>
      <Text style={NUMEROS_TABULARES} className="text-sm text-foreground">
        {target}
      </Text>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

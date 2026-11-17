import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ChevronRight, Layers, Play, Plus, Trash2, Users } from 'lucide-react-native';
import {
  circuitBadge,
  circuitExerciseChips,
  circuitPlanSummary,
  planExerciseChips,
  planSummaryLine,
  workoutApi,
  type TrainingBlock,
  type WorkoutPlan,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { cn, EmptyState, ErrorState, LoadingState, Segmented } from '@/components/ui';
import { CircuitBadge } from '@/components/workout/circuit/circuit-badge';
import { useStartCircuit } from '@/components/workout/circuit/use-start-circuit';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { colors } from '@/theme/colors';

type PlansTab = 'planos' | 'circuitos';

/**
 * Réplica de `apps/web/src/app/(app)/workout/plans/page.tsx` (Al-T6, #378 e
 * #380): as abas Planos e Circuitos, os cards, os atalhos e o "Novo plano" ou
 * "Novo circuito" preso embaixo.
 */

export default function PlansScreen() {
  const qc = useQueryClient();
  // Excluir pergunta antes, no próprio card (Al-T6): o histórico continua, mas o plano não volta.
  const [askId, setAskId] = useState<string | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<PlansTab>(params.tab === 'circuitos' ? 'circuitos' : 'planos');
  const circuitsTab = tab === 'circuitos';
  const startCircuit = useStartCircuit();

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => workoutApi.deletePlan(id),
    onSuccess: () => {
      setAskId(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  const start = useMutation({
    mutationFn: (planId: string) =>
      workoutApi.startSession({ planId, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  const activeBlock = block.data ?? null;
  const shown = plans.data?.filter((p) => (p.kind === 'CIRCUIT') === circuitsTab);
  const starting = start.isPending || startCircuit.isPending;
  const startFailed = start.isError || startCircuit.isError;

  return (
    <Screen
      refreshing={plans.isRefetching}
      onRefresh={() => void plans.refetch()}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={circuitsTab ? 'Novo circuito' : 'Novo plano'}
          onPress={() =>
            router.push((circuitsTab ? '/workout/circuits/new' : '/workout/plans/new') as Href)
          }
          className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-foreground active:opacity-80"
        >
          <Plus size={16} color={colors.background} />
          <Text className="font-sans-bold text-[15px] text-background">
            {circuitsTab ? 'Novo circuito' : 'Novo plano'}
          </Text>
        </Pressable>
      }
    >
      <View className="gap-4 px-4 pt-2">
        <Segmented<PlansTab>
          label="Planos ou circuitos"
          value={tab}
          onChange={(next) => {
            setTab(next);
            setAskId(null);
          }}
          options={[
            { value: 'planos', label: 'Planos' },
            { value: 'circuitos', label: 'Circuitos' },
          ]}
        />

        {!circuitsTab && activeBlock ? (
          <BlockCard
            block={activeBlock}
            starting={start.isPending}
            onStart={() => activeBlock.planId && start.mutate(activeBlock.planId)}
          />
        ) : null}

        {plans.isLoading ? <LoadingState /> : null}
        {plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : null}
        {shown && shown.length === 0 && !circuitsTab ? (
          <EmptyState
            title="Nenhum plano criado ainda."
            description="Monte um treino (ex.: Push, Pull, Pernas) para começar mais rápido na academia."
          />
        ) : null}
        {shown && shown.length === 0 && circuitsTab ? (
          <EmptyState
            title="Nenhum circuito ainda."
            description="Monte um AMRAP, EMOM, Tabata ou For Time e deixe o relógio contar por você."
          />
        ) : null}
        {startFailed ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Não foi possível começar o treino.
          </Text>
        ) : null}

        {shown?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            circuit={circuitsTab}
            starting={starting}
            asking={askId === plan.id}
            removing={remove.isPending}
            removeFailed={remove.isError && askId === plan.id}
            onOpen={() =>
              router.push(
                (circuitsTab
                  ? `/workout/circuits/${plan.id}`
                  : `/workout/plans/${plan.id}`) as Href,
              )
            }
            onStart={() => (circuitsTab ? startCircuit.mutate(plan.id) : start.mutate(plan.id))}
            onAsk={() => {
              remove.reset();
              setAskId(plan.id);
            }}
            onCancel={() => setAskId(null)}
            onDelete={() => remove.mutate(plan.id)}
          />
        ))}

        {!circuitsTab ? (
          <>
            <Shortcut
              icon={<Users size={20} color={colors.primaryText} />}
              title="Modelos das comunidades"
              subtitle="planos prontos dos seus grupos"
              onPress={() => router.push('/workout/templates' as Href)}
            />
            <Shortcut
              icon={<Layers size={20} color={colors.primaryText} />}
              title="Bloco de semanas"
              subtitle="organize força, volume e deload"
              onPress={() => router.push('/workout/block' as Href)}
            />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

/** O botão cinza do canvas (`btn sm`): `--s2`, 12 px de canto. */
const GREY =
  'h-10 flex-row items-center justify-center gap-2 rounded-[12px] bg-muted active:opacity-80';

/** O bloco em andamento no topo, no desenho do card do plano recebido (Al-T6). */
function BlockCard({
  block,
  starting,
  onStart,
}: {
  block: TrainingBlock;
  starting: boolean;
  onStart: () => void;
}) {
  const week = block.currentWeek ?? null;
  return (
    <View
      accessibilityLabel="Bloco de semanas em andamento"
      style={{ borderWidth: 1, borderColor: colors.borderStrong }}
      className="gap-3 rounded-card bg-card p-4"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-[17px] text-foreground">{block.kindLabel}</Text>
          {block.planName ? <Text className="text-xs text-faint">{block.planName}</Text> : null}
        </View>
        <View
          className="h-[22px] justify-center rounded-pill px-[9px]"
          style={{ backgroundColor: `${colors.info}1a` }}
        >
          <Text className="font-sans-extrabold text-[11px] uppercase tracking-wide text-info">
            bloco
          </Text>
        </View>
      </View>
      {week ? (
        <View className="gap-1.5">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="font-sans-bold text-[13px] text-foreground">
              Semana {week.weekNumber} de {block.weeksTotal}
            </Text>
            <Text className="text-xs text-faint">
              {week.sessionsDone} de {week.sessionsTarget} sessões nesta semana
            </Text>
          </View>
          <View className="h-1.5 flex-row gap-[3px]">
            {Array.from({ length: block.weeksTotal }, (_, i) => (
              <View
                key={i}
                className={cn(
                  'h-full flex-1 rounded-[3px]',
                  i + 1 < week.weekNumber ? 'bg-primary' : 'bg-surface-3',
                )}
              />
            ))}
          </View>
        </View>
      ) : null}
      {block.planId && block.planName ? (
        <View className="border-t border-border pt-3">
          <Pressable
            accessibilityRole="button"
            disabled={starting}
            onPress={onStart}
            className={cn(GREY, 'h-11', starting && 'opacity-40')}
          >
            <Play size={16} color={colors.foreground} />
            <Text className="font-sans-bold text-sm text-foreground">Começar {block.planName}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function PlanCard({
  plan,
  circuit = false,
  starting,
  asking,
  removing,
  removeFailed,
  onOpen,
  onStart,
  onAsk,
  onCancel,
  onDelete,
}: {
  plan: WorkoutPlan;
  /** Card da aba Circuitos: o resumo e o selo do formato; o toque abre o editor. */
  circuit?: boolean;
  starting: boolean;
  asking: boolean;
  removing: boolean;
  removeFailed: boolean;
  onOpen: () => void;
  onStart: () => void;
  onAsk: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const exercises = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order);
  const chips = circuit ? circuitExerciseChips(exercises) : planExerciseChips(exercises);
  const summary = circuit ? circuitPlanSummary(plan) : planSummaryLine(exercises);
  const format = circuit ? plan.circuit?.format : undefined;
  const template = Boolean(plan.fromTemplateId);
  const cantStart = starting || exercises.length === 0;
  return (
    <View className="gap-3 rounded-card bg-card p-4">
      {/* O card inteiro (nome, chips e barra) abre o plano, como na prancha. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${plan.name}, ${summary}`}
        onPress={onOpen}
        className="gap-3 active:opacity-80"
      >
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-sans-bold text-[17px] text-foreground">
              {plan.name}
            </Text>
            <Text className="text-xs text-faint">{summary}</Text>
          </View>
          {format ? (
            <CircuitBadge format={format} label={circuitBadge(format).label} />
          ) : (
            <View
              className={cn(
                'h-[22px] justify-center rounded-pill px-[9px]',
                template && 'bg-brand',
              )}
              style={template ? undefined : { backgroundColor: `${colors.primary}1f` }}
            >
              <Text
                className={cn(
                  'font-sans-extrabold text-[11px] uppercase tracking-wide',
                  template ? 'text-brand-foreground' : 'text-primary',
                )}
              >
                {template ? 'modelo' : 'seu'}
              </Text>
            </View>
          )}
        </View>
        {chips.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {chips.map((c) => (
              <View
                key={c.label}
                className="h-[30px] max-w-full flex-row items-center gap-1.5 rounded-[15px] bg-muted pl-[3px] pr-2.5"
              >
                <View className="h-6 w-6 items-center justify-center rounded-full bg-surface-3">
                  <Text className="font-sans-extrabold text-[11px] text-foreground">{c.label}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  className="shrink font-sans-semibold text-xs text-foreground"
                >
                  {c.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <PlanMuscleBar exercises={exercises} />
      </Pressable>

      <View className="flex-row items-center gap-2 border-t border-border pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Começar ${plan.name}`}
          accessibilityState={{ disabled: cantStart }}
          disabled={cantStart}
          onPress={onStart}
          className={cn(GREY, 'flex-1', cantStart && 'opacity-40')}
        >
          <Play size={16} color={colors.foreground} />
          <Text className="font-sans-bold text-sm text-foreground">Começar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Excluir plano ${plan.name}`}
          accessibilityState={{ expanded: asking }}
          onPress={onAsk}
          className={cn(GREY, 'w-10')}
        >
          <Trash2 size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {asking ? (
        <View
          accessibilityLabel={`Excluir “${plan.name}”?`}
          style={{
            backgroundColor: `${colors.danger}1a`,
            borderWidth: 1,
            borderColor: `${colors.danger}59`,
          }}
          className="gap-2.5 rounded-[14px] p-3"
        >
          <Text className="font-sans-bold text-sm text-foreground">Excluir “{plan.name}”?</Text>
          <Text className="text-xs text-faint">O histórico das sessões continua.</Text>
          {removeFailed ? (
            <Text accessibilityRole="alert" className="text-xs text-danger">
              Não foi possível excluir. Tente de novo.
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Pressable accessibilityRole="button" onPress={onCancel} className={cn(GREY, 'flex-1')}>
              <Text className="font-sans-bold text-sm text-foreground">Cancelar</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={removing}
              onPress={onDelete}
              style={{ backgroundColor: `${colors.danger}26` }}
              className={cn(
                'h-10 flex-1 items-center justify-center rounded-[12px] active:opacity-80',
                removing && 'opacity-40',
              )}
            >
              <Text className="font-sans-bold text-sm text-danger">
                {removing ? 'Excluindo...' : 'Excluir'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Shortcut({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={{ borderWidth: 1.5, borderColor: colors.borderStrong }}
      className="flex-row items-center gap-3 rounded-card px-4 py-3.5 active:opacity-80"
    >
      {icon}
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-sm text-foreground">{title}</Text>
        <Text className="text-xs text-faint">{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={colors.faintForeground} />
    </Pressable>
  );
}

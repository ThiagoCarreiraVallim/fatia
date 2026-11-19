import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ChevronDown, Heart, Plus, Repeat, Trophy } from 'lucide-react-native';
import {
  ApiError,
  activeSessionIdFromError,
  cardioOnly,
  cardioRecordLine,
  feelingOf,
  formatBestSet,
  muscleGroupName,
  repeatPlanOf,
  sessionPlanAction,
  sessionDetailBody,
  sessionDetailTitle,
  sessionHero,
  setLine,
  workoutApi,
  type WorkoutSessionSummary,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { Text } from '@/components/ui/text';
import { Button, EmptyState, ErrorState, LoadingState, cn } from '@/components/ui';
import { ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { useStartSession } from '@/components/workout/use-start-session';
import { CircuitResultBlocks } from '@/components/workout/circuit/circuit-result';
import { useStartCircuit } from '@/components/workout/circuit/use-start-circuit';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { SessionFeedbackCard } from '@/components/workout/session-feedback-card';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/app/(app)/workout/history/[id]/page.tsx`: uma sessão
 * antiga aberta do histórico (pranchas `Al-T11` força e `Al-T11b` cardio,
 * #381). Antes ela abria na rota da sessão, que não tinha volta; aqui a seta
 * leva ao histórico (o pai no mapa de rotas) e o "Repetir" começa um treino
 * novo com os mesmos exercícios. Sessão de treino livre ainda pode virar plano.
 *
 * A sessão de circuito (#380, prancha `Al-T11c`) tem o corpo dela
 * (`CircuitDetail`), com "Repetir circuito"; não vira plano nem corrige séries.
 */

// `text-background`: escuro no rosa do tema escuro, claro no vermelho do claro.
const HERO_TONE = {
  strength: { box: 'bg-primary', text: 'text-primary-foreground' },
  cardio: { box: 'bg-danger', text: 'text-background' },
} as const;

export default function HistorySessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const summary = useQuery({
    queryKey: ['workout', 'session', id, 'summary'],
    queryFn: () => workoutApi.getSessionSummary(id),
  });

  // Sessão ainda aberta (link antigo): o lugar dela é o treino em andamento.
  const stillOpen = summary.data != null && summary.data.completedAt == null;
  useEffect(() => {
    if (stillOpen) router.replace(`/workout/session/${id}` as Href);
  }, [stillOpen, router, id]);

  if (summary.isLoading || stillOpen) {
    return (
      <Screen>
        <LoadingState label="Carregando treino…" />
      </Screen>
    );
  }
  if (summary.error instanceof ApiError && summary.error.status === 404) {
    return (
      <Screen>
        <EmptyState
          title="Treino não encontrado"
          description="Ele pode ter sido apagado."
          action={
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.navigate('/workout/history' as Href)}
            >
              Voltar ao histórico
            </Button>
          }
        />
      </Screen>
    );
  }
  if (summary.isError || !summary.data) {
    return (
      <Screen>
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </Screen>
    );
  }
  const body = sessionDetailBody(summary.data);
  if (body.kind === 'circuit') {
    return (
      <CircuitDetail
        summary={summary.data}
        circuit={body.circuit}
        repeatPlanId={body.repeatPlanId}
        refreshing={summary.isRefetching}
        onRefresh={() => void summary.refetch()}
      />
    );
  }
  return (
    <Detail
      summary={summary.data}
      refreshing={summary.isRefetching}
      onRefresh={() => void summary.refetch()}
    />
  );
}

/** Al-T11c: o circuito feito, com "Repetir circuito" (some se o circuito foi apagado). */
function CircuitDetail({
  summary,
  circuit,
  repeatPlanId: planId,
  refreshing,
  onRefresh,
}: {
  summary: WorkoutSessionSummary;
  circuit: NonNullable<WorkoutSessionSummary['circuit']>;
  repeatPlanId: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const start = useStartCircuit();
  const repeatNow = () => {
    if (planId) start.mutate(planId);
  };
  const failed = start.isError && !activeSessionIdFromError(start.error);
  return (
    <Screen
      title={sessionDetailTitle(summary.startedAt)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      actions={
        planId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Repetir este circuito hoje"
            accessibilityState={{ disabled: start.isPending }}
            disabled={start.isPending}
            onPress={repeatNow}
            className={TOP_BAR_ACTION}
          >
            <Repeat size={18} color={colors.foreground} />
          </Pressable>
        ) : undefined
      }
      footer={
        planId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: start.isPending }}
            disabled={start.isPending}
            onPress={repeatNow}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-foreground active:opacity-80"
          >
            <Repeat size={16} color={colors.background} />
            <Text className="font-sans-bold text-[15px] text-background">Repetir circuito</Text>
          </Pressable>
        ) : undefined
      }
    >
      <View className="gap-4 px-4 pt-2">
        <CircuitResultBlocks
          circuit={circuit}
          feeling={summary.feeling ?? summary.overallFeeling}
        />
        {summary.notes ? (
          <View className="rounded-card bg-card px-4 py-3.5">
            <Text className="text-xs text-faint">“{summary.notes}”</Text>
          </View>
        ) : null}
        <SessionFeedbackCard feedback={summary.feedback} />
        {failed ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Não foi possível começar o circuito. Tente de novo.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function Detail({
  summary,
  refreshing,
  onRefresh,
}: {
  summary: WorkoutSessionSummary;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const units = useUnitPrefs();
  const router = useRouter();
  const qc = useQueryClient();
  const hero = sessionHero(summary, units);
  const tone = HERO_TONE[hero.tone];
  const onlyCardio = cardioOnly(summary);
  const feeling = feelingOf(summary.feeling ?? summary.overallFeeling);
  const repeat = useStartSession();
  const isFree = summary.planId == null;
  const planAction = sessionPlanAction(summary);

  const saveAsPlan = useMutation({
    mutationFn: () => workoutApi.saveSessionAsPlan(summary.sessionId),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      // A volta ao detalhe já mostra "Ver plano".
      void qc.invalidateQueries({
        queryKey: ['workout', 'session', summary.sessionId, 'summary'],
      });
      router.push(`/workout/plans/${plan.id}` as Href);
    },
  });

  const repeatNow = () => repeat.mutate(repeatPlanOf(summary));
  // O 409 (já havia um treino aberto) não é erro: o hook leva a ele.
  const repeatFailed = repeat.isError && !activeSessionIdFromError(repeat.error);

  return (
    <Screen
      title={sessionDetailTitle(summary.startedAt)}
      refreshing={refreshing}
      onRefresh={onRefresh}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Repetir este treino hoje"
          accessibilityState={{ disabled: repeat.isPending }}
          disabled={repeat.isPending}
          onPress={repeatNow}
          className={TOP_BAR_ACTION}
        >
          <Repeat size={18} color={colors.foreground} />
        </Pressable>
      }
      footer={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: repeat.isPending }}
            disabled={repeat.isPending}
            onPress={repeatNow}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-foreground active:opacity-80"
          >
            <Repeat size={16} color={colors.background} />
            <Text className="font-sans-bold text-[15px] text-background">
              {isFree ? 'Repetir' : 'Repetir este treino'}
            </Text>
          </Pressable>
          {planAction?.kind === 'view' ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/workout/plans/${planAction.planId}` as Href)}
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-primary active:opacity-80"
            >
              <Text className="font-sans-bold text-[15px] text-primary-foreground">Ver plano</Text>
            </Pressable>
          ) : null}
          {planAction?.kind === 'save' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: saveAsPlan.isPending }}
              disabled={saveAsPlan.isPending}
              onPress={() => saveAsPlan.mutate()}
              className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-pill bg-muted active:opacity-80"
            >
              <Plus size={16} color={colors.foreground} />
              <Text className="font-sans-bold text-[15px] text-foreground">
                {saveAsPlan.isPending ? 'Salvando...' : 'Salvar como plano'}
              </Text>
            </Pressable>
          ) : null}
        </>
      }
    >
      <View className="gap-4 px-4 pt-2">
        <View
          accessibilityLabel="Resumo do treino"
          className={cn('gap-2.5 rounded-[24px] p-[18px]', tone.box)}
        >
          <Text
            className={cn('font-sans-extrabold text-xs tracking-[0.72px] opacity-70', tone.text)}
          >
            {hero.label}
          </Text>
          <View className="flex-row">
            {hero.facts.map((f) => (
              <View
                key={f.label}
                accessible
                accessibilityLabel={`${f.value} ${f.label}`}
                className="flex-1 gap-0.5"
              >
                <Text className={cn('font-display text-[26px]', tone.text)}>{f.value}</Text>
                <Text className={cn('font-sans-semibold text-xs opacity-70', tone.text)}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {onlyCardio ? (
          <CardioBody summary={summary} />
        ) : (
          <>
            {feeling || summary.notes ? <FeelingCard summary={summary} /> : null}
            <StrengthExercises summary={summary} />
          </>
        )}

        <SessionFeedbackCard feedback={summary.feedback} />

        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/workout/session/${summary.sessionId}` as Href)}
          className="min-h-11 items-center justify-center"
        >
          <Text className="font-sans-semibold text-xs text-muted-foreground">
            Corrigir séries deste treino
          </Text>
        </Pressable>

        {repeatFailed || saveAsPlan.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {saveAsPlan.isError
              ? 'Não foi possível salvar como plano. Tente de novo.'
              : 'Não foi possível começar o treino. Tente de novo.'}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function FeelingCard({ summary }: { summary: WorkoutSessionSummary }) {
  const feeling = feelingOf(summary.feeling ?? summary.overallFeeling);
  return (
    <View
      accessibilityLabel="Como foi o treino"
      className="flex-row items-center gap-3 rounded-card bg-card px-4 py-3.5"
    >
      {feeling ? <Text className="text-[28px]">{feeling.emoji}</Text> : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans-bold text-sm text-foreground">
          {feeling?.label ?? 'Como foi'}
        </Text>
        {summary.notes ? <Text className="text-xs text-faint">“{summary.notes}”</Text> : null}
      </View>
    </View>
  );
}

function StrengthExercises({ summary }: { summary: WorkoutSessionSummary }) {
  const units = useUnitPrefs();
  // A prancha abre o primeiro; o toque abre e fecha cada um.
  const [open, setOpen] = useState<number | null>(summary.exercises[0]?.exerciseId ?? null);
  return (
    <View className="gap-4">
      {summary.exercises.map((e) => {
        const expanded = open === e.exerciseId;
        const sets = `${e.sets} ${e.sets === 1 ? 'série' : 'séries'}`;
        return (
          <View key={e.exerciseId} className="rounded-card bg-card px-4">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${e.exerciseName}, ${sets}${e.isRecord ? ', recorde' : ''}`}
              onPress={() => setOpen(expanded ? null : e.exerciseId)}
              className="min-h-[68px] flex-row items-center gap-3 active:opacity-80"
            >
              <ExerciseThumb group={e.muscleGroup} size={44} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-sans-semibold text-[15px] text-foreground">
                  {e.exerciseName}
                </Text>
                <Text className="text-xs text-faint">
                  {muscleGroupName(e.muscleGroup)} · {sets}
                </Text>
              </View>
              {e.isRecord ? (
                <View className="h-[22px] flex-row items-center gap-1 rounded-pill bg-primary/15 px-[9px]">
                  <Trophy size={14} color={colors.primaryText} />
                  <Text className="font-sans-extrabold text-[11px] uppercase tracking-[0.44px] text-primary">
                    recorde
                  </Text>
                </View>
              ) : null}
              <View style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}>
                <ChevronDown size={16} color={colors.faintForeground} />
              </View>
            </Pressable>
            {expanded ? (
              <View className="pb-1.5">
                {(e.setList ?? []).map((s) => {
                  const f = feelingOf(s.feeling);
                  return (
                    <View
                      key={s.setNumber}
                      accessible
                      accessibilityLabel={`Série ${s.setNumber}: ${setLine(s, units)}${f ? `, ${f.label}` : ''}`}
                      className="min-h-11 flex-row items-center gap-2.5 border-t border-border"
                    >
                      <Text className="w-5 text-xs text-faint">{s.setNumber}</Text>
                      <Text className="flex-1 font-sans-bold text-sm text-foreground">
                        {setLine(s, units)}
                      </Text>
                      <Text className="text-lg">{f?.emoji ?? ''}</Text>
                    </View>
                  );
                })}
                {!e.setList?.length ? (
                  <Text className="border-t border-border py-3 text-sm text-muted-foreground">
                    {formatBestSet(e.best, units.loadUnit)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Al-T11b: um treino livre só de cardio. */
function CardioBody({ summary }: { summary: WorkoutSessionSummary }) {
  const units = useUnitPrefs();
  const ex = summary.exercises[0]!;
  const feeling = feelingOf(summary.feeling ?? summary.overallFeeling);
  const record = summary.records.find((r) => r.distanceMeters != null);
  const recordLine = record ? cardioRecordLine(record, units) : null;
  const detail = [
    `${summary.exercises.length} ${summary.exercises.length === 1 ? 'exercício' : 'exercícios'}`,
    'cardio',
    formatBestSet(ex.best, units.loadUnit),
  ].join(' · ');
  return (
    <>
      <View className="flex-row gap-2">
        <View
          accessible
          accessibilityLabel={`${ex.best?.kcalBurned ?? 'sem'} kcal`}
          className="flex-1 gap-0.5 rounded-[18px] bg-card p-3.5"
        >
          <Text className="font-sans-bold text-[22px] text-foreground">
            {ex.best?.kcalBurned ?? '—'}
          </Text>
          <Text className="text-xs text-faint">kcal</Text>
        </View>
        <View
          accessible
          accessibilityLabel={`Como foi: ${feeling?.label ?? 'sem marca'}`}
          className="flex-1 gap-0.5 rounded-[18px] bg-card p-3.5"
        >
          <Text className="font-sans-bold text-[22px] text-foreground">
            {feeling?.emoji ?? '—'}
          </Text>
          <Text className="text-xs text-faint">como foi</Text>
        </View>
      </View>

      {recordLine ? (
        <View className="flex-row items-center gap-3 rounded-[18px] bg-steps px-4 py-3">
          <Trophy size={16} color={colors.background} />
          <Text className="flex-1 font-sans-bold text-sm text-background">{recordLine.title}</Text>
          {recordLine.before ? (
            <Text className="font-sans-bold text-background">{recordLine.before}</Text>
          ) : null}
        </View>
      ) : null}

      {summary.exercises.map((e) => (
        <View
          key={e.exerciseId}
          className="flex-row items-center gap-3 rounded-card bg-card px-4 py-3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-danger/15">
            <Heart size={16} color={colors.danger} />
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-sans-bold text-sm text-foreground">{e.exerciseName}</Text>
            <Text className="text-xs text-faint">
              {e.exerciseId === ex.exerciseId ? detail : formatBestSet(e.best, units.loadUnit)}
            </Text>
          </View>
        </View>
      ))}

      <Text className="text-xs text-faint">
        Cardio é um exercício como os outros: aqui foi um treino livre só com ele.
      </Text>

      {feeling || summary.notes ? <FeelingCard summary={summary} /> : null}
    </>
  );
}

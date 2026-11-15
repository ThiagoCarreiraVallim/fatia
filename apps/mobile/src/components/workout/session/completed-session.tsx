import { useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Share2, Trophy } from 'lucide-react-native';
import {
  appendNoteShortcut,
  buildExerciseGroups,
  checkinDoneMessage,
  comparisonFacts,
  feelingOf,
  formatBestSet,
  howItWentBody,
  muscleGroupLabel,
  noteShortcutsFor,
  questionsAudience,
  questionsTitle,
  recordsTitle,
  summaryFacts,
  summaryHeadline,
  workoutApi,
  type WorkoutSession,
  type WorkoutSessionSummary,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import { Button, Chip, ErrorState, Input, LoadingState, cn } from '@/components/ui';
import { MuscleDiagram } from '@/components/workout/muscle-diagram';
import { checkinBody, groupColorName } from '@/components/workout/workout-home';
import { FeelingPicker } from './feeling-picker';
import { SetChips } from './set-chips';
import { SetEditor } from './set-editor';
import { colors } from '@/theme/colors';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';

/**
 * "Treino feito!" (pranchas `Al-T5-Fim` e `Al-T5b-Fim-perguntas`, #377): o
 * resumo, a comparação com o último do mesmo plano, os recordes, os músculos
 * do dia e cada exercício; "Como foi o treino?" com a observação; e, quando
 * alguém da equipe lê o Treino, as perguntas rápidas dela.
 *
 * É também a tela de um treino antigo, aberto pelo histórico: tocar num
 * exercício abre as séries para corrigir (carga que saiu errada é o motivo
 * mais comum de abrir um treino do passado).
 *
 * Ponto de extensão: o check-in de desafio do canvas entra aqui quando os desafios
 * tiverem a ponte com o treino.
 */
export function CompletedSession({
  session,
  refreshing,
  onRefresh,
}: {
  session: WorkoutSession;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const summary = useQuery({
    queryKey: ['workout', 'session', session.id, 'summary'],
    queryFn: () => workoutApi.getSessionSummary(session.id),
  });

  return (
    <Screen
      title="Treino feito!"
      refreshing={refreshing || summary.isRefetching}
      onRefresh={() => {
        onRefresh();
        void summary.refetch();
      }}
    >
      {summary.isLoading ? <LoadingState label="Somando o treino…" /> : null}
      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : null}
      {summary.data ? <Summary session={session} summary={summary.data} /> : null}
    </Screen>
  );
}

function Summary({
  session,
  summary,
}: {
  session: WorkoutSession;
  summary: WorkoutSessionSummary;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [feeling, setFeeling] = useState<number | null>(session.feeling ?? null);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [openExercise, setOpenExercise] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const units = useUnitPrefs();
  const facts = summaryFacts(summary, units.loadUnit);
  // Fica aqui, e não nas perguntas: o resumo recarregado já traz o check-in, e
  // o aviso de "enviadas" sumiria junto com o cartão.
  const [questionsDone, setQuestionsDone] = useState<{ skipped: boolean } | null>(null);
  const headline = summaryHeadline(summary);
  const groups = useMemo(() => buildExerciseGroups(undefined, session.sets, []), [session.sets]);
  const maxGroupSets = Math.max(1, ...summary.muscles.groups.map((g) => g.sets));

  const save = useMutation({
    mutationFn: async () => {
      // Desmarcar a sensação ou apagar a observação também grava (#377).
      const body = howItWentBody(
        { feeling: session.feeling ?? null, notes: session.notes ?? null },
        { feeling, notes },
      );
      if (Object.keys(body).length > 0) await workoutApi.updateSession(session.id, body);
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      void qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      router.replace('/workout');
    },
  });

  function share() {
    const lines = [
      `Treino feito! ${headline}`,
      facts.map((f) => `${f.value} ${f.label}`).join(' · '),
      ...summary.records.map((r) => `🏆 ${r.exerciseName}`),
    ];
    void Share.share({ message: lines.join('\n') });
  }

  return (
    <View className="gap-5 px-5 pb-6 pt-2">
      <Text className="text-[13px] text-muted-foreground">{headline}</Text>

      <View className="flex-row gap-2">
        {facts.map((f) => (
          <View
            key={f.label}
            accessible
            accessibilityLabel={`${f.label}: ${f.value}`}
            className="flex-1 items-center gap-0.5 rounded-2xl bg-card py-3"
          >
            <Text className="font-display-semibold text-xl text-foreground">{f.value}</Text>
            <Text className="text-[11px] text-muted-foreground">{f.label}</Text>
          </View>
        ))}
      </View>

      {summary.comparison ? (
        <View className="gap-2 rounded-3xl bg-card p-4">
          <Text className="font-sans-bold text-[13px] text-muted-foreground">
            Comparado ao último {summary.planName ?? 'treino'}
          </Text>
          <View className="flex-row gap-2">
            {comparisonFacts(summary.comparison).map((c) => (
              <View key={c.label} className="flex-1">
                <Text
                  className={cn(
                    'font-sans-bold text-base',
                    c.tone === 'up' ? 'text-primary-text' : 'text-foreground',
                  )}
                >
                  {c.value}
                </Text>
                <Text className="text-[11px] text-muted-foreground">{c.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {summary.records.length > 0 ? (
        <View className="gap-2 rounded-3xl bg-card p-4">
          <View className="flex-row items-center gap-2">
            <Trophy size={16} color={colors.steps} />
            <Text accessibilityRole="header" className="font-sans-bold text-base text-foreground">
              {recordsTitle(summary.records.length)}
            </Text>
          </View>
          {summary.records.map((r) => (
            <View key={r.exerciseId} className="flex-row items-center justify-between gap-2">
              <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
                {r.exerciseName}
              </Text>
              <Text className="font-sans-bold text-sm text-foreground">
                {formatBestSet({ ...r, avgHeartRate: null }, units.loadUnit)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {summary.muscles.primary.length > 0 || summary.muscles.groups.length > 0 ? (
        <View className="gap-3 rounded-3xl bg-card p-4">
          <Text accessibilityRole="header" className="font-sans-bold text-base text-foreground">
            Músculos de hoje
          </Text>
          <View className="flex-row items-center gap-4">
            <MuscleDiagram
              primaryMuscles={summary.muscles.primary}
              secondaryMuscles={summary.muscles.secondary}
              width={56}
            />
            <View className="min-w-0 flex-1 gap-2">
              {summary.muscles.groups.map((g) => (
                <View
                  key={g.group}
                  accessible
                  accessibilityLabel={`${muscleGroupLabel(g.group)}: ${g.sets} séries`}
                  className="gap-1"
                >
                  <View className="flex-row justify-between">
                    <Text className="text-[12px] text-foreground">{muscleGroupLabel(g.group)}</Text>
                    <Text className="text-[12px] text-muted-foreground">{g.sets}</Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${(g.sets / maxGroupSets) * 100}%`,
                        backgroundColor: colors[groupColorName(g.group)],
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        {summary.exercises.map((e) => {
          const group = groups.find((g) => g.exerciseId === e.exerciseId);
          const open = openExercise === e.exerciseId;
          const editingSet = open && editing != null ? group?.sets[editing] : undefined;
          return (
            <View key={e.exerciseId} className="gap-2 rounded-2xl bg-card px-4 py-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${e.exerciseName}, ${e.sets} séries, melhor ${formatBestSet(e.best, units.loadUnit)}${e.isRecord ? ', recorde' : ''}. Tocar para corrigir as séries`}
                accessibilityState={{ expanded: open }}
                onPress={() => {
                  setEditing(null);
                  setOpenExercise(open ? null : e.exerciseId);
                }}
                className="min-h-[44px] flex-row items-center gap-3"
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
                    {e.exerciseName}
                  </Text>
                  <Text className="text-[12px] text-muted-foreground">
                    {e.sets} {e.sets === 1 ? 'série' : 'séries'} ·{' '}
                    {formatBestSet(e.best, units.loadUnit)}
                  </Text>
                </View>
                {e.isRecord ? <Trophy size={16} color={colors.steps} /> : null}
                {feelingOf(e.feeling) ? (
                  <Text className="text-lg">{feelingOf(e.feeling)!.emoji}</Text>
                ) : null}
              </Pressable>
              {open && group ? (
                <SetChips group={group} editing={editingSet ? editing : null} onEdit={setEditing} />
              ) : null}
              {editingSet && editing != null && group ? (
                <SetEditor
                  key={editingSet.id}
                  set={editingSet}
                  index={editing}
                  isCardio={group.isCardio}
                  sessionId={session.id}
                  onClose={() => setEditing(null)}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {summary.questions && (!summary.checkin || questionsDone) ? (
        <TeamQuestions
          sessionId={session.id}
          questions={summary.questions}
          done={questionsDone}
          onDone={setQuestionsDone}
        />
      ) : null}

      <View className="gap-3 rounded-3xl bg-card p-4">
        <FeelingPicker title="Como foi o treino?" value={feeling} onChange={setFeeling} />
        <Input
          multiline
          value={notes}
          onChangeText={setNotes}
          maxLength={500}
          accessibilityLabel="Observação do treino"
          placeholder="Alguma observação? (opcional)"
          className="min-h-[88px] rounded-2xl border-border text-base"
          style={{ textAlignVertical: 'top' }}
        />
        <View className="flex-row flex-wrap gap-2">
          {noteShortcutsFor(notes).map((label) => (
            <Chip
              key={label}
              label={label}
              onPress={() => setNotes((current) => appendNoteShortcut(current, label))}
            />
          ))}
        </View>
      </View>

      {save.error ? (
        <Text className="text-xs text-danger">Não deu para salvar. Tente de novo.</Text>
      ) : null}

      <View className="flex-row gap-2">
        <Button variant="outline" className="h-14 flex-1 rounded-full" onPress={share}>
          <Share2 size={16} color={colors.foreground} />
          <Text className="font-sans-bold text-sm text-foreground">Compartilhar</Text>
        </Button>
        <Button
          className="h-14 flex-1 rounded-full"
          disabled={save.isPending}
          loading={save.isPending}
          onPress={() => save.mutate()}
        >
          Salvar
        </Button>
      </View>
    </View>
  );
}

/**
 * As perguntas da equipe (prancha `Al-T5b`): só quando alguém com Treino
 * liberado vai ler. Cansaço de 1 a 5 e dor (com onde, se sim). "Pular" também
 * responde — a equipe vê que a pessoa pulou, e não fica perguntando de novo.
 */
function TeamQuestions({
  sessionId,
  questions,
  done,
  onDone,
}: {
  sessionId: string;
  questions: NonNullable<WorkoutSessionSummary['questions']>;
  done: { skipped: boolean } | null;
  onDone: (done: { skipped: boolean }) => void;
}) {
  const qc = useQueryClient();
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [pain, setPain] = useState<boolean | null>(null);
  const [painLocation, setPainLocation] = useState('');

  const send = useMutation({
    mutationFn: (skipped: boolean) =>
      workoutApi.saveCheckin(
        sessionId,
        skipped ? { skipped: true } : checkinBody({ fatigue, pain, painLocation }),
      ),
    onSuccess: (_r, skipped) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone({ skipped });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
    },
  });

  const fatigueQ = questions.items.find((q) => q.key === 'fatigue');
  const painQ = questions.items.find((q) => q.key === 'pain');
  const audience = questionsAudience(questions.askedBy);

  if (done) {
    return (
      <View className="gap-1 rounded-3xl bg-card p-4">
        <Text className="font-sans-bold text-sm text-foreground">
          {checkinDoneMessage(done.skipped, questions.askedBy)}
        </Text>
        <Text className="text-[12px] text-muted-foreground">{audience}</Text>
      </View>
    );
  }

  return (
    <View className="gap-4 rounded-3xl bg-card p-4">
      <Text accessibilityRole="header" className="font-sans-bold text-base text-foreground">
        {questionsTitle(questions.askedBy)}
      </Text>

      {fatigueQ ? (
        <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={fatigueQ.label}>
          <Text className="text-sm text-foreground">{fatigueQ.label}</Text>
          <View className="flex-row gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={`${n}${n === 1 && fatigueQ.scaleLabels ? `, ${fatigueQ.scaleLabels[0]}` : ''}${n === 5 && fatigueQ.scaleLabels ? `, ${fatigueQ.scaleLabels[1]}` : ''}`}
                accessibilityState={{ selected: fatigue === n }}
                onPress={() => setFatigue(fatigue === n ? null : n)}
                className={cn(
                  'h-12 flex-1 items-center justify-center rounded-2xl',
                  fatigue === n ? 'bg-primary' : 'bg-muted',
                )}
              >
                <Text
                  className={cn(
                    'font-sans-bold text-base',
                    fatigue === n ? 'text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
          {fatigueQ.scaleLabels ? (
            <View className="flex-row justify-between">
              <Text className="text-[11px] text-muted-foreground">{fatigueQ.scaleLabels[0]}</Text>
              <Text className="text-[11px] text-muted-foreground">{fatigueQ.scaleLabels[1]}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {painQ ? (
        <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={painQ.label}>
          <Text className="text-sm text-foreground">{painQ.label}</Text>
          <View className="flex-row gap-2">
            {[
              { label: 'Não', value: false },
              { label: 'Sim', value: true },
            ].map((o) => (
              <Pressable
                key={o.label}
                accessibilityRole="radio"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: pain === o.value }}
                onPress={() => setPain(pain === o.value ? null : o.value)}
                className={cn(
                  'h-12 flex-1 items-center justify-center rounded-2xl',
                  pain === o.value ? 'bg-primary' : 'bg-muted',
                )}
              >
                <Text
                  className={cn(
                    'font-sans-bold text-sm',
                    pain === o.value ? 'text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {pain ? (
            <Input
              value={painLocation}
              onChangeText={setPainLocation}
              maxLength={120}
              accessibilityLabel="Onde doeu"
              placeholder="Onde? (ex.: joelho direito)"
              className="rounded-2xl border-border text-base"
            />
          ) : null}
        </View>
      ) : null}

      {send.error ? (
        <Text className="text-xs text-danger">Não deu para enviar. Tente de novo.</Text>
      ) : null}

      <View className="flex-row gap-2">
        <Button
          variant="ghost"
          className="h-12 flex-1 rounded-full"
          disabled={send.isPending}
          onPress={() => send.mutate(true)}
        >
          Pular
        </Button>
        <Button
          className="h-12 flex-1 rounded-full"
          disabled={send.isPending || (fatigue == null && pain == null)}
          loading={send.isPending}
          onPress={() => send.mutate(false)}
        >
          Enviar
        </Button>
      </View>
      <Text className="text-center text-[11px] text-muted-foreground">{audience}</Text>
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Play, X } from 'lucide-react-native';
import {
  diffSummary,
  exerciseChangeText,
  exerciseSetsText,
  initialsOf,
  offerActions,
  offerAnswerCopy,
  offerSentLine,
  offerStage,
  offerTitle,
  offerWhen,
  planOffersApi,
  type OfferExercise,
  type PlanOffer,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { ErrorState, LoadingState, cn, useToast } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { mensagemDeErro } from '@/components/nutrition/helpers';
import { useStartSession } from '@/components/workout/use-start-session';
import { deviceTimezone } from '@/components/workout/offer-view';
import { useOpenExerciseDetail } from '@/components/workout/exercise-detail-context';
import { ExerciseGroupLine, ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { colors } from '@/theme/colors';

/**
 * Plano de treino recebido da equipe (#379, pranchas Al-T2 e Al-T2b). Réplica
 * de `apps/web/src/app/(app)/workout/offers/[id]/page.tsx`: aceitar e recusar são
 * diretos como na prancha (o aceite mostra "Começar agora"; a recusa,
 * "Desfazer"), e a atualização mostra o que mudou em cada exercício.
 */

const PILL = 'h-14 items-center justify-center rounded-pill active:opacity-80';

export default function PlanOfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const startSession = useStartSession();
  const key = ['plan-offers', id] as const;

  const q = useQuery({ queryKey: key, queryFn: () => planOffersApi.get(id), enabled: !!id });

  const answered = (offer: PlanOffer) => {
    qc.setQueryData(key, offer);
    void qc.invalidateQueries({ queryKey: ['plan-offers'] });
    void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    void qc.invalidateQueries({ queryKey: ['workout', 'agenda'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const fail = (alternativa: string) => (e: unknown) =>
    toast.show({
      message: mensagemDeErro(e, {
        conflito: 'Esse plano mudou. Puxe a tela para ver a versão nova.',
        alternativa,
      }),
    });
  const accept = useMutation({
    mutationFn: (versionId: string) => planOffersApi.accept(id, versionId),
    onSuccess: answered,
    onError: fail('Não deu para aceitar. Tente de novo.'),
  });
  const decline = useMutation({
    mutationFn: (versionId: string) => planOffersApi.decline(id, versionId),
    onSuccess: answered,
    onError: fail('Não deu para responder. Tente de novo.'),
  });
  const undo = useMutation({
    mutationFn: (versionId: string) => planOffersApi.undoDecline(id, versionId),
    onSuccess: answered,
    onError: (e) =>
      toast.show({ message: mensagemDeErro(e, { alternativa: 'Não deu para desfazer.' }) }),
  });

  const offer = q.data;
  const stage = offer ? offerStage(offer) : null;
  const actions = offer ? offerActions(offer) : null;
  const busy = accept.isPending || decline.isPending || startSession.isPending;

  const onPrimary = () => {
    if (!offer) return;
    if (stage === 'answer') accept.mutate(offer.shown.id);
    else if (stage === 'accepted' && offer.planId) startSession.mutate({ planId: offer.planId });
    else router.navigate('/workout' as Href);
  };
  const onSecondary = () => {
    if (stage === 'answer' && offer) decline.mutate(offer.shown.id);
    else router.navigate('/workout' as Href);
  };

  const footer =
    offer && actions ? (
      <>
        {actions.secondary ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onSecondary}
            className={cn(PILL, 'bg-muted px-5', busy && 'opacity-40')}
          >
            <Text className="font-sans-bold text-[15px] text-foreground">{actions.secondary}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onPrimary}
          className={cn(
            PILL,
            'flex-1 flex-row gap-2',
            stage === 'answer' || stage === 'accepted' ? 'bg-primary' : 'bg-muted',
            busy && 'opacity-40',
          )}
        >
          {stage === 'accepted' ? <Play size={16} color={colors.primaryForeground} /> : null}
          <Text
            className={cn(
              'font-sans-bold text-[15px]',
              stage === 'answer' || stage === 'accepted'
                ? 'text-primary-foreground'
                : 'text-foreground',
            )}
          >
            {actions.primary}
          </Text>
        </Pressable>
      </>
    ) : null;

  return (
    <>
      <Screen
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
        footer={footer}
        actions={
          <View
            className="h-[22px] justify-center rounded-pill px-[9px]"
            style={{ backgroundColor: `${colors.info}1a` }}
          >
            <Text className="font-sans-extrabold text-[11px] uppercase tracking-wide text-info">
              personal
            </Text>
          </View>
        }
      >
        <View className="gap-5 px-5 pt-2">
          {q.isLoading ? <LoadingState label="Carregando plano…" /> : null}
          {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
          {offer ? (
            <OfferBody
              offer={offer}
              undoing={undo.isPending}
              onUndo={() => undo.mutate(offer.shown.id)}
            />
          ) : null}
        </View>
      </Screen>
    </>
  );
}

function OfferBody({
  offer,
  undoing,
  onUndo,
}: {
  offer: PlanOffer;
  undoing: boolean;
  onUndo: () => void;
}) {
  const v = offer.shown;
  const when = offerWhen(v);
  const stage = offerStage(offer);
  const author = offer.author?.name ?? null;
  const sent = offerSentLine(offer.group?.name ?? null, v.sentAt, new Date(), deviceTimezone());

  return (
    <>
      <View className="flex-row items-center gap-3">
        <Avatar name={author} size={40} />
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-[15px] text-foreground">
            {author ?? 'Sua equipe'}
          </Text>
          <Text className="text-xs text-faint">{sent}</Text>
        </View>
      </View>

      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="font-display-semibold text-[32px] leading-[38px] text-foreground"
        >
          {offerTitle(v)}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <View
            className="h-[22px] justify-center rounded-pill px-[9px]"
            style={{
              backgroundColor: when.tone === 'calendar' ? `${colors.info}1a` : colors.muted,
            }}
          >
            <Text
              className={cn(
                'font-sans-extrabold text-[11px] uppercase tracking-wide',
                when.tone === 'calendar' ? 'text-info' : 'text-muted-foreground',
              )}
            >
              {when.label}
            </Text>
          </View>
          <Text className="text-xs text-muted-foreground">{when.sub}</Text>
        </View>
      </View>

      {offer.kind === 'update' && (offer.diff || v.changeNote) ? (
        <View
          className="gap-1 rounded-card p-4"
          style={{
            backgroundColor: `${colors.info}14`,
            borderWidth: 1,
            borderColor: `${colors.info}40`,
          }}
        >
          <Text className="font-sans-bold text-sm text-foreground">O que mudou</Text>
          {/* Quem mandou pela biblioteca escreve o que mudou (#405). */}
          {v.changeNote ? <Text className="text-sm text-foreground">{v.changeNote}</Text> : null}
          {offer.diff ? (
            <Text className="text-xs text-muted-foreground">
              {diffSummary(offer.diff)} em relação à v{offer.accepted?.version ?? v.version - 1} que
              você usa.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row gap-2">
        <Stat value={String(v.summary.exercises)} label="exercícios" />
        <Stat value={String(v.summary.sets)} label="séries" />
        <Stat value={`~${v.summary.minutes}′`} label="duração" />
      </View>

      {v.note ? (
        <View className="flex-row gap-3 rounded-card bg-card p-4">
          <Avatar name={author} size={28} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-sans-bold text-[13px] text-foreground">
              {author?.trim().split(/\s+/)[0] ?? 'Equipe'}
            </Text>
            <Text className="text-sm text-foreground">{v.note}</Text>
          </View>
        </View>
      ) : null}

      <View className="overflow-hidden rounded-card bg-card px-4">
        {v.exercises.map((e, i) => (
          <ExerciseRow key={e.key} exercise={e} divider={i > 0} />
        ))}
        {v.removed.map((r) => (
          <View key={r.key} className="flex-row items-center gap-3 border-t border-border py-3">
            <X size={14} color={colors.danger} />
            <Text className="min-w-0 flex-1 text-sm text-faint line-through">{r.name}</Text>
            <Text className="text-xs text-danger">removido</Text>
          </View>
        ))}
      </View>

      <AnswerCard offer={offer} undoing={undoing} onUndo={onUndo} />

      {stage === 'superseded' ? (
        <Text className="text-center text-xs text-faint">
          Esta versão foi substituída por uma mais nova.
        </Text>
      ) : null}
    </>
  );
}

function AnswerCard({
  offer,
  undoing,
  onUndo,
}: {
  offer: PlanOffer;
  undoing: boolean;
  onUndo: () => void;
}) {
  const stage = offerStage(offer);
  if (stage !== 'accepted' && stage !== 'declined') return null;
  const copy = offerAnswerCopy(
    stage === 'accepted' ? 'accepted' : 'declined',
    offer.author?.name ?? null,
    offer.kind,
  );
  const ok = stage === 'accepted';
  return (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-3 rounded-card p-4"
      style={{
        backgroundColor: ok ? `${colors.primary}1a` : `${colors.warning}1a`,
        borderWidth: 1,
        borderColor: ok ? `${colors.primary}59` : `${colors.warning}4d`,
      }}
    >
      {ok ? <Check size={20} color={colors.primary} /> : null}
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-sm text-foreground">{copy.title}</Text>
        <Text className="text-xs text-muted-foreground">{copy.body}</Text>
      </View>
      {!ok ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Desfazer a recusa"
          disabled={undoing}
          onPress={onUndo}
          className={cn(
            'h-[34px] flex-row items-center gap-1.5 rounded-chip bg-muted px-3',
            undoing && 'opacity-40',
          )}
        >
          <Text className="font-sans-bold text-[13px] text-foreground">Desfazer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ExerciseRow({ exercise: e, divider }: { exercise: OfferExercise; divider: boolean }) {
  const openDetail = useOpenExerciseDetail();
  const change = exerciseChangeText(e.changes);
  const group = (e.muscleGroup ?? '').toLowerCase();
  return (
    <Pressable
      accessibilityRole={e.exerciseId != null ? 'button' : undefined}
      accessibilityLabel={e.exerciseId != null ? `Como fazer ${e.name}` : undefined}
      disabled={e.exerciseId == null}
      onPress={() => e.exerciseId != null && openDetail(e.exerciseId)}
      className={cn(
        'min-h-[72px] flex-row items-center gap-3 py-2.5',
        divider && 'border-t border-border',
      )}
    >
      <ExerciseThumb group={group} size={52} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className="min-w-0 shrink font-sans-semibold text-[15px] text-foreground"
          >
            {e.name}
          </Text>
          {e.isNew ? (
            <View
              className="h-[18px] justify-center rounded-pill px-2"
              style={{ backgroundColor: `${colors.primary}26` }}
            >
              <Text className="font-sans-extrabold text-[11px] uppercase text-primary-text">
                novo
              </Text>
            </View>
          ) : null}
        </View>
        {e.muscleGroup ? <ExerciseGroupLine group={group} /> : null}
        {change ? <Text className="text-xs text-info">{change}</Text> : null}
      </View>
      <Text
        className="font-sans-bold text-sm text-foreground"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {exerciseSetsText(e)}
      </Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-card bg-card px-3 py-3">
      <Text
        className="font-display-semibold text-[22px] text-foreground"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      <Text className="text-xs text-faint">{label}</Text>
    </View>
  );
}

function Avatar({ name, size }: { name: string | null; size: number }) {
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `${colors.water}2e` }}
    >
      <Text
        className="font-sans-extrabold"
        style={{ color: colors.water, fontSize: size > 30 ? 13 : 11 }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

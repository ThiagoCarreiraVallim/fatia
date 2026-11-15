'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Play } from 'lucide-react';
import {
  diffSummary,
  exerciseChangeText,
  exerciseSetsText,
  initialsOf,
  offerAnswerCopy,
  offerSentLine,
  offerTitle,
  offerWhen,
  planOffersApi,
  type OfferExercise,
  type PlanOffer,
} from '@fatia/api-client';
import { ErrorState } from '@/components/elements/error-state';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { errorMessage } from '@/components/nutrition/error-message';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useStartSession } from '@/components/workout/cards/workout-cards';
import { groupTone } from '@/components/workout/group-tone';
import { PLAN_OFFERS_KEY } from '@/components/workout/received-offer-notice';
import { cn } from '@/lib/utils';

const pill =
  'anim-press flex h-14 items-center justify-center gap-2 rounded-pill text-[15px] font-bold disabled:opacity-50';
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? null;

/**
 * Plano de treino recebido da equipe (#379, pranchas Al-T2 e Al-T2b). Nada
 * muda sem o aceite: "Aceitar" pergunta antes; "Recusar" avisa a equipe e pode
 * ser desfeito. Na atualização, a tela diz o que mudou em relação à versão em
 * uso e a pessoa troca ou mantém a atual.
 */
export default function PlanOfferPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ['plan-offer', id] as const;
  const q = useQuery({ queryKey: key, queryFn: () => planOffersApi.get(id) });
  const [confirmAccept, setConfirmAccept] = useState(false);
  const start = useStartSession();

  const settle = (offer: PlanOffer) => {
    qc.setQueryData(key, offer);
    void qc.invalidateQueries({ queryKey: PLAN_OFFERS_KEY });
    void qc.invalidateQueries({ queryKey: ['workout'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const fail = (fallback: string) => (e: unknown) =>
    toast.error(
      errorMessage(e, {
        conflict: 'Esse plano mudou enquanto você olhava. Veja de novo.',
        fallback,
      }),
    );

  const accept = useMutation({
    mutationFn: (versionId: string) => planOffersApi.accept(id, versionId),
    onSuccess: (offer) => {
      setConfirmAccept(false);
      settle(offer);
    },
    onError: fail('Não deu para aceitar o plano. Tente de novo.'),
  });
  const decline = useMutation({
    mutationFn: (versionId: string) => planOffersApi.decline(id, versionId),
    onSuccess: settle,
    onError: fail('Não deu para recusar. Tente de novo.'),
  });
  const undo = useMutation({
    mutationFn: (versionId: string) => planOffersApi.undoDecline(id, versionId),
    onSuccess: settle,
    onError: fail('Não deu para desfazer. Tente de novo.'),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-2">
        <Skeleton className="h-12 rounded-card bg-muted" />
        <Skeleton className="h-24 rounded-card bg-muted" />
        <Skeleton className="h-64 rounded-card bg-muted" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="px-4 pt-2">
        <ErrorState
          className="max-w-none"
          title="Não foi possível abrir o plano"
          detail={q.error instanceof Error ? q.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }

  const offer = q.data;
  const v = offer.shown;
  const authorName = offer.author?.name ?? null;
  const when = offerWhen(v);
  const isUpdate = offer.kind === 'update';
  const planId = offer.planId ?? offer.accepted?.planId ?? null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const answered =
    v.status === 'ACCEPTED' ? 'accepted' : v.status === 'DECLINED' ? 'declined' : null;
  const answer = answered ? offerAnswerCopy(answered, authorName, offer.kind) : null;
  const busy = accept.isPending || decline.isPending || undo.isPending;

  return (
    <DockedPage className="px-4 pt-2">
      <TopBarActions>
        <span className="inline-flex h-[22px] items-center rounded-pill bg-[hsl(var(--info)/0.1)] px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-info">
          personal
        </span>
      </TopBarActions>

      <div className="flex items-center gap-3 px-1">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--water)/0.18)] text-[13px] font-extrabold text-water"
        >
          {initialsOf(authorName)}
        </span>
        <span className="min-w-0">
          <b className="block truncate">{authorName ?? 'Sua equipe'}</b>
          <span className="block text-xs text-muted-foreground">
            {offerSentLine(offer.group?.name ?? null, v.sentAt, new Date(), timezone)}
          </span>
        </span>
      </div>

      <div className="space-y-2 px-1">
        <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em]">
          {offerTitle(v)}
        </h1>
        <p className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex h-[22px] items-center rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
              when.tone === 'calendar'
                ? 'bg-[hsl(var(--info)/0.1)] text-info'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {when.label}
          </span>
          <span className="text-xs text-muted-foreground">{when.sub}</span>
        </p>
      </div>

      {isUpdate && offer.diff && (
        <section
          aria-label="O que mudou"
          className="rounded-card bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_hsl(var(--water)/0.35)]"
        >
          <b className="block text-sm">
            {offer.accepted ? `O que mudou desde a v${offer.accepted.version}` : 'O que mudou'}
          </b>
          <span className="block text-xs text-muted-foreground">{diffSummary(offer.diff)}</span>
        </section>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(v.summary.exercises)} label="exercícios" />
        <Stat value={String(v.summary.sets)} label="séries" />
        <Stat value={`~${v.summary.minutes}′`} label="duração" />
      </div>

      {v.note && (
        <div className="flex items-start gap-3 rounded-card bg-card px-4 py-3.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--water)/0.18)] text-[11px] font-extrabold text-water"
          >
            {initialsOf(authorName)}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[13px]">{firstName(authorName) ?? 'Equipe'}</b>
            <span className="block text-sm text-foreground">{v.note}</span>
          </span>
        </div>
      )}

      <ul aria-label="Exercícios" className="divide-y divide-border rounded-card bg-card px-4">
        {v.exercises.map((e) => (
          <ExerciseRow key={e.key} exercise={e} showChanges={isUpdate} />
        ))}
      </ul>

      {isUpdate && v.removed.length > 0 && (
        <section aria-label="Saíram do plano" className="space-y-1.5 px-1">
          <span className="block text-xs font-bold uppercase tracking-[0.04em] text-faint">
            Saem do plano
          </span>
          <ul className="space-y-1">
            {v.removed.map((r) => (
              <li key={r.key} className="text-sm text-muted-foreground line-through">
                {r.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {answered === 'accepted' && answer && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-card bg-primary/10 px-4 py-3.5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
        >
          <Check size={20} aria-hidden className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <b className="block text-sm">{answer.title}</b>
            <span className="block text-xs text-muted-foreground">{answer.body}</span>
          </span>
        </div>
      )}

      {answered === 'declined' && answer && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-card bg-[hsl(var(--steps)/0.1)] px-4 py-3.5 shadow-[inset_0_0_0_1px_hsl(var(--steps)/0.3)]"
        >
          <span className="min-w-0 flex-1">
            <b className="block text-sm">{answer.title}</b>
            <span className="block text-xs text-muted-foreground">{answer.body}</span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => undo.mutate(v.id)}
            className="anim-press inline-flex h-[34px] shrink-0 items-center rounded-chip bg-muted px-3.5 text-[13px] font-bold disabled:opacity-50"
          >
            Desfazer
          </button>
        </div>
      )}

      <DockedAction>
        {v.status === 'PENDING' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => decline.mutate(v.id)}
              className={cn(pill, 'bg-muted px-5 text-foreground')}
            >
              {isUpdate ? 'Manter a atual' : 'Recusar'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmAccept(true)}
              className={cn(pill, 'flex-1 bg-primary text-primary-foreground')}
            >
              {isUpdate ? 'Aceitar troca' : 'Aceitar plano'}
            </button>
          </>
        )}
        {answered === 'accepted' && planId && (
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => start.mutate(planId, { onSuccess: () => router.push('/workout') })}
            className={cn(pill, 'flex-1 bg-primary text-primary-foreground')}
          >
            <Play size={16} aria-hidden />
            Começar agora
          </button>
        )}
        {(answered === 'declined' || v.status === 'SUPERSEDED') && (
          <Link href="/workout" className={cn(pill, 'flex-1 bg-muted text-foreground')}>
            Voltar
          </Link>
        )}
      </DockedAction>

      <ConfirmSheet
        open={confirmAccept}
        onOpenChange={setConfirmAccept}
        title={isUpdate ? `Trocar para ${offerTitle(v)}?` : `Aceitar ${offerTitle(v)}?`}
        description={acceptText(offer)}
        icon="check"
        tone="default"
        confirmLabel="Aceitar"
        pendingLabel="Aceitando..."
        pending={accept.isPending}
        onConfirm={() => accept.mutate(v.id)}
      />
    </DockedPage>
  );
}

/** O que o aceite faz, numa linha, antes de fazer. */
function acceptText(offer: PlanOffer): string {
  if (offer.kind === 'update') {
    return 'O plano em uso passa para esta versão. Seus treinos feitos continuam no histórico.';
  }
  return offer.shown.schedule === 'CALENDAR'
    ? 'Ele entra nos seus planos, e as sessões entram na sua agenda a partir de hoje.'
    : 'Ele entra nos seus planos, sem datas: siga no seu ritmo.';
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[18px] bg-card p-3.5">
      <b className="block text-[22px] tabular-nums">{value}</b>
      <span className="block text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ExerciseRow({
  exercise: e,
  showChanges,
}: {
  exercise: OfferExercise;
  showChanges: boolean;
}) {
  const tone = groupTone((e.muscleGroup ?? '').toLowerCase());
  const change = showChanges ? exerciseChangeText(e.changes) : null;
  return (
    <li className="flex min-h-[72px] items-center gap-3 py-3">
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{e.name}</span>
          {e.isNew && (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-pill bg-primary/15 px-2 text-[11px] font-extrabold text-primary">
              novo
            </span>
          )}
        </span>
        {e.muscleGroup && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span
              aria-hidden
              className="h-[7px] w-[7px] rounded-[2px]"
              style={{ background: tone }}
            />
            {e.muscleGroup}
          </span>
        )}
        {change && <span className="block text-xs font-semibold text-info">{change}</span>}
      </span>
      <b className="shrink-0 text-sm tabular-nums">{exerciseSetsText(e)}</b>
    </li>
  );
}

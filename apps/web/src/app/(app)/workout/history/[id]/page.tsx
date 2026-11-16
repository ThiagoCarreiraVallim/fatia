'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChevronDown, Heart, Plus, Repeat, Trophy } from 'lucide-react';
import {
  ApiError,
  cardioOnly,
  cardioRecordLine,
  feelingOf,
  formatBestSet,
  muscleGroupName,
  repeatPlanOf,
  sessionDetailTitle,
  sessionHero,
  setLine,
  workoutApi,
  type WorkoutSessionSummary,
} from '@fatia/api-client';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/elements/error-state';
import { ExerciseThumb } from '@/components/workout/plan-exercise-row';
import { useStartWithExercises } from '@/components/workout/use-start-with-exercises';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { cn } from '@/lib/utils';

const HERO_TONE = {
  strength: 'bg-primary text-primary-foreground',
  cardio: 'bg-danger text-[#2a0710]',
} as const;

/**
 * Uma sessão antiga, aberta do histórico (pranchas `Al-T11` força e `Al-T11b`
 * cardio, #381). Diferente do "Treino feito" (Al-T5), que é foco e sai pelo
 * "Salvar": aqui há barra, a seta volta ao histórico e o "Repetir" começa um
 * treino novo com os mesmos exercícios. Sessão de treino livre ainda pode
 * virar plano ("Salvar como plano").
 *
 * **Ponto de extensão (#380):** a sessão de circuito (`kind === 'circuit'`,
 * Al-T11c: rounds, média e tempo de cada round, "Repetir circuito") ganha o
 * próprio corpo aqui e o terceiro tom em `sessionHero`, quando o resumo trouxer
 * o resultado do circuito. Até lá nenhuma sessão é circuito.
 */
export default function HistorySessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const summary = useQuery({
    queryKey: ['workout', 'session', id, 'summary'],
    queryFn: () => workoutApi.getSessionSummary(id),
  });
  useTopBarTitle(summary.data ? sessionDetailTitle(summary.data.startedAt) : null);

  // Sessão ainda aberta (link antigo): o lugar dela é o treino em andamento.
  const stillOpen = summary.data != null && summary.data.completedAt == null;
  useEffect(() => {
    if (stillOpen) router.replace('/workout');
  }, [stillOpen, router]);

  if (summary.isLoading) {
    return (
      <div className="space-y-3 px-4 pt-2">
        <Skeleton className="h-28 rounded-3xl bg-muted" />
        <Skeleton className="h-16 rounded-2xl bg-muted" />
        <Skeleton className="h-16 rounded-2xl bg-muted" />
      </div>
    );
  }
  if (summary.error instanceof ApiError && summary.error.status === 404) {
    return (
      <EmptyState
        title="Treino não encontrado"
        description="Ele pode ter sido apagado."
        action={
          <Link href="/workout/history" className="text-sm font-bold text-primary-text">
            Voltar ao histórico
          </Link>
        }
      />
    );
  }
  if (summary.isError || !summary.data) {
    return (
      <ErrorState
        className="max-w-none"
        title="Não foi possível abrir o treino"
        detail="Tente de novo."
        retryLabel="Tentar de novo"
        onRetry={() => void summary.refetch()}
      />
    );
  }
  return <Detail summary={summary.data} />;
}

function Detail({ summary }: { summary: WorkoutSessionSummary }) {
  const units = useUnitPrefs();
  const router = useRouter();
  const qc = useQueryClient();
  const hero = sessionHero(summary, units);
  const onlyCardio = cardioOnly(summary);
  const feeling = feelingOf(summary.feeling ?? summary.overallFeeling);
  const repeat = useStartWithExercises();
  const isFree = summary.planId == null;

  const saveAsPlan = useMutation({
    mutationFn: () => workoutApi.saveSessionAsPlan(summary.sessionId),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push(`/workout/plans/${plan.id}`);
    },
  });

  const repeatNow = () => repeat.mutate(repeatPlanOf(summary));

  return (
    <DockedPage className="px-4 pt-2">
      <TopBarActions>
        <button
          type="button"
          aria-label="Repetir este treino hoje"
          disabled={repeat.isPending}
          onClick={repeatNow}
          className={topBarActionClass}
        >
          <Repeat size={18} aria-hidden />
        </button>
      </TopBarActions>

      <section
        aria-label="Resumo do treino"
        className={cn('space-y-2.5 rounded-[24px] p-[18px]', HERO_TONE[hero.tone])}
      >
        <p className="text-xs font-extrabold tracking-[0.06em] opacity-70">{hero.label}</p>
        <dl className="grid grid-cols-3">
          {hero.facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="order-last text-xs font-semibold opacity-70">{f.label}</dt>
              <dd className="font-display text-[26px] font-bold tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {onlyCardio ? (
        <CardioBody summary={summary} />
      ) : (
        <>
          {(feeling || summary.notes) && <FeelingCard summary={summary} />}
          <StrengthExercises summary={summary} />
        </>
      )}

      <Link
        href={`/workout/session/${summary.sessionId}`}
        className="block px-1 text-center text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
      >
        Corrigir séries deste treino
      </Link>

      {(repeat.isError || saveAsPlan.isError) && (
        <p role="alert" className="text-sm text-danger">
          {saveAsPlan.isError
            ? 'Não foi possível salvar como plano. Tente de novo.'
            : 'Não foi possível começar o treino. Tente de novo.'}
        </p>
      )}

      <DockedAction>
        <button
          type="button"
          disabled={repeat.isPending}
          onClick={repeatNow}
          className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-foreground text-[15px] font-bold text-background disabled:opacity-60"
        >
          <Repeat size={16} aria-hidden />
          {isFree ? 'Repetir' : 'Repetir este treino'}
        </button>
        {isFree && (
          <button
            type="button"
            disabled={saveAsPlan.isPending}
            onClick={() => saveAsPlan.mutate()}
            className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-60"
          >
            <Plus size={16} aria-hidden />
            {saveAsPlan.isPending ? 'Salvando...' : 'Salvar como plano'}
          </button>
        )}
      </DockedAction>
    </DockedPage>
  );
}

function FeelingCard({ summary }: { summary: WorkoutSessionSummary }) {
  const feeling = feelingOf(summary.feeling ?? summary.overallFeeling);
  return (
    <section
      aria-label="Como foi o treino"
      className="flex items-center gap-3 rounded-card bg-card px-4 py-3.5"
    >
      {feeling && (
        <span aria-hidden className="text-[28px]">
          {feeling.emoji}
        </span>
      )}
      <span className="min-w-0 flex-1 space-y-0.5">
        <b className="block text-sm">{feeling?.label ?? 'Como foi'}</b>
        {summary.notes && (
          <span className="block text-sm text-muted-foreground">“{summary.notes}”</span>
        )}
      </span>
    </section>
  );
}

function StrengthExercises({ summary }: { summary: WorkoutSessionSummary }) {
  const units = useUnitPrefs();
  // A prancha abre o primeiro; o toque abre e fecha cada um.
  const [open, setOpen] = useState<number | null>(summary.exercises[0]?.exerciseId ?? null);
  return (
    <ol aria-label="Exercícios" className="space-y-4">
      {summary.exercises.map((e) => {
        const expanded = open === e.exerciseId;
        return (
          <li key={e.exerciseId} className="rounded-card bg-card px-4">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : e.exerciseId)}
              className="flex min-h-[68px] w-full items-center gap-3 text-left"
            >
              <ExerciseThumb group={e.muscleGroup} size={44} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block text-[15px] font-semibold">{e.exerciseName}</span>
                <span className="block text-sm text-muted-foreground">
                  {muscleGroupName(e.muscleGroup)} · {e.sets} {e.sets === 1 ? 'série' : 'séries'}
                </span>
              </span>
              {e.isRecord && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-primary-soft px-2 py-1 text-xs font-bold text-primary-text">
                  <Trophy size={14} aria-hidden />
                  recorde
                </span>
              )}
              <ChevronDown
                size={16}
                aria-hidden
                className={cn('shrink-0 text-faint transition-transform', expanded && 'rotate-180')}
              />
            </button>
            {expanded && (
              <ol aria-label={`Séries de ${e.exerciseName}`} className="pb-1.5">
                {(e.setList ?? []).map((s) => (
                  <li
                    key={s.setNumber}
                    className="flex min-h-11 items-center gap-2.5 border-t border-border tabular-nums"
                  >
                    <span className="w-5 text-sm text-muted-foreground">{s.setNumber}</span>
                    <b className="flex-1 text-sm">{setLine(s, units)}</b>
                    <span aria-label={feelingOf(s.feeling)?.label} className="text-lg">
                      {feelingOf(s.feeling)?.emoji ?? ''}
                    </span>
                  </li>
                ))}
                {!e.setList?.length && (
                  <li className="border-t border-border py-3 text-sm text-muted-foreground">
                    {formatBestSet(e.best, units.loadUnit)}
                  </li>
                )}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
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
      <dl className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 rounded-[18px] bg-card p-3.5">
          <dt className="order-last text-sm text-muted-foreground">kcal</dt>
          <dd className="text-[22px] font-bold tabular-nums">{ex.best?.kcalBurned ?? '—'}</dd>
        </div>
        <div className="flex flex-col gap-0.5 rounded-[18px] bg-card p-3.5">
          <dt className="order-last text-sm text-muted-foreground">como foi</dt>
          <dd className="text-[22px] font-bold" aria-label={feeling?.label ?? 'sem marca'}>
            {feeling?.emoji ?? '—'}
          </dd>
        </div>
      </dl>

      {recordLine && (
        <p className="flex items-center gap-3 rounded-[18px] bg-steps px-4 py-3 text-[#1f1300]">
          <Trophy size={16} aria-hidden />
          <b className="flex-1 text-sm">{recordLine.title}</b>
          {recordLine.before && <span className="font-bold tabular-nums">{recordLine.before}</span>}
        </p>
      )}

      {summary.exercises.map((e) => (
        <div key={e.exerciseId} className="flex items-center gap-3 rounded-card bg-card px-4 py-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"
          >
            <Heart size={16} />
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <b className="block text-sm">{e.exerciseName}</b>
            <span className="block text-sm text-muted-foreground">
              {e.exerciseId === ex.exerciseId ? detail : formatBestSet(e.best, units.loadUnit)}
            </span>
          </span>
        </div>
      ))}

      <p className="text-sm text-muted-foreground">
        Cardio é um exercício como os outros: aqui foi um treino livre só com ele.
      </p>

      {(feeling || summary.notes) && <FeelingCard summary={summary} />}
    </>
  );
}

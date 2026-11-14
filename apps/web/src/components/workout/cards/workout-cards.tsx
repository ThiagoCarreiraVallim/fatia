'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  daysAgoLabel,
  formatDecimal,
  lastSessionSummary,
  lastWorkoutWhen,
  muscleGroupLabel,
  musclesOfGroups,
  restedHeadline,
  weeklySetsBars,
  workoutApi,
  type WeeklyMuscleSummary,
  type WorkoutSession,
} from '@fatia/api-client';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleDiagram } from '@/components/workout/muscle-diagram';
import { cn } from '@/lib/utils';

const card = 'flex h-full flex-col gap-3.5 rounded-3xl bg-card p-[18px]';
const eyebrow = 'text-[13px] font-bold text-muted-foreground';
const primaryBtn =
  'anim-press flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60';
const secondaryBtn =
  'anim-press flex h-11 flex-1 items-center justify-center rounded-full bg-muted px-3 text-sm font-extrabold text-foreground';

/** Começa uma sessão com o plano: a tela de Treino passa a mostrar a sessão aberta. */
function useStartPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string | null) =>
      workoutApi.startSession({ planId: planId ?? undefined, startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });
}

/** 1 · Músculos descansados: sugere o plano da pessoa que os trabalha, sem obrigar. */
export function RestedMusclesCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const start = useStartPlan();
  const plan = summary.suggestedPlan;
  const groups = summary.rested.map((r) => r.group);
  return (
    <section aria-label="Seus músculos hoje" className={card}>
      <h3 className={eyebrow}>Seus músculos hoje</h3>
      <div className="flex items-center gap-3.5">
        <div className="w-16 shrink-0">
          <MuscleDiagram primaryMuscles={musclesOfGroups(groups)} view="front" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-base font-bold leading-snug text-foreground">
            {restedHeadline(summary.rested)}
          </p>
          <ul className="flex flex-col gap-1">
            {summary.rested.slice(0, 3).map((r) => (
              <li key={r.group} className="text-[13px] text-muted-foreground">
                {muscleGroupLabel(r.group)} · {daysAgoLabel(r.daysSince)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-auto flex gap-2">
        {plan ? (
          <button
            type="button"
            disabled={start.isPending}
            onClick={() => start.mutate(plan.id)}
            className={primaryBtn}
          >
            {plan.name}
          </button>
        ) : null}
        <Link href="/workout/plans" className={secondaryBtn}>
          Outro plano
        </Link>
      </div>
    </section>
  );
}

/** 2 · Repetir o último: para quem faz sempre o mesmo treino. O humor vem com a #377. */
export function RepeatLastCard({ session }: { session: WorkoutSession }) {
  const start = useStartPlan();
  const summary = lastSessionSummary(session);
  const facts = [
    summary.durationMinutes !== null ? `${summary.durationMinutes} min` : null,
    `${summary.sets} ${summary.sets === 1 ? 'série' : 'séries'}`,
    `${formatDecimal(summary.volumeTons)} t`,
  ].filter(Boolean);
  return (
    <section aria-label="Repetir o último treino" className={card}>
      <h3 className={eyebrow}>Último treino · {lastWorkoutWhen(session.startedAt)}</h3>
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-[28px] font-bold leading-none text-foreground">
          {summary.name}
        </p>
        <p className="text-[13px] tabular-nums text-muted-foreground">{facts.join(' · ')}</p>
      </div>
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate(session.planId)}
          className={secondaryBtn}
        >
          Repetir
        </button>
        <Link href="/workout/plans" className={primaryBtn}>
          Escolher outro
        </Link>
      </div>
    </section>
  );
}

/** 3 · Séries por músculo na semana, contra a meta de 12: mostra o que ficou para trás. */
export function WeeklySetsByMuscleCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const bars = weeklySetsBars(summary);
  return (
    <section aria-label="Séries por músculo na semana" className={card}>
      <div className="flex items-center justify-between">
        <h3 className={eyebrow}>Séries por músculo · semana</h3>
        <span className="text-[13px] text-muted-foreground">meta {summary.target}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {bars.map((b, i) => (
          <li key={b.group} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-foreground">{b.label}</span>
              <span className="tabular-nums text-muted-foreground">{b.sets}</span>
            </div>
            <div
              role="meter"
              aria-label={`${b.label}: ${b.sets} de ${summary.target} séries`}
              aria-valuemin={0}
              aria-valuemax={summary.target}
              aria-valuenow={Math.min(b.sets, summary.target)}
              className="h-1.5 rounded-full bg-surface-3"
            >
              <span
                style={{ width: `${b.ratio * 100}%`, ['--i' as string]: i }}
                className={cn('anim-grow-x block h-full rounded-full bg-primary')}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O carrossel da aba Treino (prancha `Al-T-Cards-treino`): músculos
 * descansados, repetir o último e séries por músculo. Card sem dado não entra
 * (sem treino nenhum, o "Repetir" não tem o que repetir).
 */
export function WorkoutCardsCarousel() {
  const muscles = useQuery({
    queryKey: ['workout', 'muscles', 'week'],
    queryFn: () => workoutApi.getWeeklyMuscleSummary(),
  });
  const last = useQuery({
    queryKey: ['workout', 'sessions', 'last'],
    queryFn: () => workoutApi.getLastSession(),
  });

  if (muscles.isLoading || last.isLoading) {
    return <Skeleton className="h-56 rounded-3xl bg-muted" />;
  }

  const items = [
    muscles.data ? <RestedMusclesCard key="rested" summary={muscles.data} /> : null,
    last.data ? <RepeatLastCard key="last" session={last.data} /> : null,
    muscles.data ? <WeeklySetsByMuscleCard key="weekly" summary={muscles.data} /> : null,
  ].filter(Boolean);
  if (items.length === 0) return null;

  return (
    <Carousel opts={{ align: 'start' }} aria-label="Cards de treino">
      <CarouselContent>
        {items.map((item, i) => (
          <CarouselItem key={i} className="basis-[86%] sm:basis-1/2">
            {item}
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}

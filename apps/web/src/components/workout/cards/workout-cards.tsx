'use client';

import Link from 'next/link';
import { Play, Repeat } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  activeSessionIdFromError,
  daysAgoLabel,
  feelingOf,
  formatDecimal,
  lastSessionSummary,
  muscleGroupLabel,
  MUSCLE_TONE_LEGEND,
  musclesByRestTone,
  type MuscleTone,
  type RestedMuscle,
  lastWorkoutWhen,
  restedHeadline,
  weeklySetsBars,
  workoutApi,
  type WeeklyMuscleSummary,
  type WorkoutSession,
} from '@fatia/api-client';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { MuscleDiagram } from '../muscle-diagram';
import { cn } from '@/lib/utils';

/** A cor de cada tom do descanso, em token (o diagrama resolve a variável). */
const TONE_FILL: Record<MuscleTone, string> = {
  rested: 'hsl(var(--primary))',
  recovering: 'hsl(var(--steps))',
  recent: 'hsl(var(--foreground) / 0.18)',
};

/**
 * "Seus músculos hoje" (#377): o diagrama anatômico completo, cada músculo no
 * tom do descanso do grupo. Nunca a silhueta simplificada da prancha.
 */
export function RestedBody({ rested }: { rested: readonly RestedMuscle[] }) {
  const colors = useMemo(() => {
    const tones = musclesByRestTone(rested);
    return Object.fromEntries(Object.entries(tones).map(([m, t]) => [m, TONE_FILL[t]]));
  }, [rested]);
  const label = rested.length
    ? rested.map((r) => `${muscleGroupLabel(r.group)} · ${daysAgoLabel(r.daysSince)}`).join(', ')
    : 'Nenhum grupo descansado';
  return <MuscleDiagram colors={colors} label={label} view="both" sizeClassName="w-14" />;
}

export function BodyToneLegend() {
  return (
    <ul aria-label="Legenda" className="flex flex-col gap-1">
      {MUSCLE_TONE_LEGEND.map((item) => (
        <li key={item.tone} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: TONE_FILL[item.tone] }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

const card = 'flex h-full flex-col gap-3.5 rounded-3xl bg-card p-[18px]';
const eyebrow = 'text-[13px] font-bold text-muted-foreground';
const primaryBtn =
  'anim-press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60';
const secondaryBtn =
  'anim-press flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-muted px-3 text-sm font-extrabold text-foreground';

/**
 * Começa uma sessão: a tela de Treino passa a mostrar a sessão aberta. Se já
 * havia uma aberta (409, outra aba, o app, o MCP), mostra essa em vez de erro.
 */
export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (planId: string | null) => {
      try {
        return await workoutApi.startSession({
          planId: planId ?? undefined,
          startedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (activeSessionIdFromError(error)) return null;
        throw error;
      }
    },
    onSuccess: (session) => {
      if (session) qc.setQueryData(['workout', 'active'], session);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });
}

/** 1 · Músculos descansados: sugere o plano da pessoa que os trabalha, sem obrigar. */
export function RestedMusclesCard({ summary }: { summary: WeeklyMuscleSummary }) {
  const start = useStartSession();
  const plan = summary.suggestedPlan;
  return (
    <section aria-label="Seus músculos hoje" className={card}>
      <h3 className={eyebrow}>Seus músculos hoje</h3>
      <div className="flex items-center gap-3.5">
        <div className="shrink-0">
          <RestedBody rested={summary.rested} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-base font-bold leading-snug text-foreground">
            {restedHeadline(summary.rested)}
          </p>
          <BodyToneLegend />
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
            <Play size={16} aria-hidden />
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

/** 2 · Repetir o último: para quem faz sempre o mesmo treino, com a sensação marcada no fim. */
export function RepeatLastCard({ session }: { session: WorkoutSession }) {
  const start = useStartSession();
  const summary = lastSessionSummary(session);
  const feeling = feelingOf(session.feeling);
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
        {feeling ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <span aria-hidden className="text-lg">
              {feeling.emoji}
            </span>
            <span>{feeling.label}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          disabled={start.isPending}
          onClick={() => start.mutate(session.planId)}
          className={secondaryBtn}
        >
          <Repeat size={16} aria-hidden />
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

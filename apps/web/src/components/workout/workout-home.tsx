'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, HeartPulse, History, Plus, Zap } from 'lucide-react';
import {
  dayOfMonth,
  planCardInfo,
  planMuscleBars,
  QUICK_TEMPLATES,
  trainingWeekLabel,
  WEEKDAY_LETTERS,
  workoutApi,
  type TrainingWeek,
  type WorkoutPlan,
} from '@fatia/api-client';
import { ErrorState } from '@/components/elements/error-state';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { TabHeader, headerButtonClass } from '@/components/layout/tab-header';
import { cn } from '@/lib/utils';
import { BlockTimeline } from './block-timeline';
import { useStartSession, WorkoutCardsCarousel } from './cards/workout-cards';
import { groupTone } from './group-tone';

const sectionTitle = 'text-base font-extrabold text-foreground';

/** A faixa da semana (prancha Al-T1): segunda a domingo, treinados em destaque. */
function WeekStrip({ week }: { week: TrainingWeek }) {
  return (
    <section aria-labelledby="treino-semana" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="treino-semana" className={sectionTitle}>
          Semana
        </h2>
        <span className="text-[13px] text-muted-foreground">{trainingWeekLabel(week)}</span>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {week.days.map((d, i) => {
          const day = dayOfMonth(d.date);
          const chip = (
            <>
              <span className="text-[11px] font-bold opacity-70">{WEEKDAY_LETTERS[i]}</span>
              <span className="text-sm font-extrabold tabular-nums">{day}</span>
            </>
          );
          const tone = cn(
            'flex h-14 flex-col items-center justify-center rounded-2xl',
            d.trained
              ? 'bg-primary text-primary-foreground'
              : d.active
                ? 'bg-primary-soft text-primary-text'
                : 'bg-muted text-muted-foreground',
            d.today && 'ring-2 ring-foreground',
          );
          return (
            <li key={d.date} aria-current={d.today ? 'date' : undefined}>
              {d.trained ? (
                <Link
                  href="/workout/history"
                  aria-label={`Dia ${day}, treinou`}
                  className={cn(tone, 'anim-press')}
                >
                  {chip}
                </Link>
              ) : (
                <div
                  aria-label={`Dia ${day}${d.today ? ', hoje' : d.active ? ', se mexeu' : ''}`}
                  className={tone}
                >
                  {chip}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PlanCard({ plan }: { plan: WorkoutPlan }) {
  const start = useStartSession();
  const names = (plan.exercises ?? [])
    .slice(0, 3)
    .map((e) => e.exercise?.name)
    .filter(Boolean)
    .join(' · ');
  const bars = planMuscleBars(plan);
  return (
    <div className="flex h-full flex-col gap-3 rounded-3xl border border-subtle bg-card p-4">
      <Link href={`/workout/plans/${plan.id}`} className="min-w-0 space-y-1">
        <p className="truncate text-base font-extrabold text-foreground">{plan.name}</p>
        <p className="text-xs text-muted-foreground">{planCardInfo(plan)}</p>
        {names && <p className="truncate text-[13px] text-foreground/80">{names}</p>}
      </Link>
      {bars.length > 0 && (
        <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
          {bars.map((b) => (
            <span
              key={b.group}
              style={{ width: `${b.share * 100}%`, background: groupTone(b.group) }}
              className="block h-full"
            />
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label={`Começar ${plan.name}`}
        disabled={start.isPending}
        onClick={() => start.mutate(plan.id)}
        className="anim-press mt-auto h-11 rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {start.isPending ? 'Começando…' : 'Começar'}
      </button>
    </div>
  );
}

function PlansSection() {
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  return (
    <section aria-labelledby="treino-planos" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="treino-planos" className={sectionTitle}>
          Seus planos
        </h2>
        <Link href="/workout/plans" className="text-[13px] font-bold text-primary">
          Ver todos
        </Link>
      </div>

      {plans.isLoading && <Skeleton className="h-44 rounded-3xl bg-muted" />}

      {plans.isError && (
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar seus planos"
          detail={plans.error instanceof Error ? plans.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void plans.refetch()}
        />
      )}

      {plans.data && (
        <Carousel opts={{ align: 'start', dragFree: true }}>
          <CarouselContent>
            {plans.data.map((plan) => (
              <CarouselItem key={plan.id} className="basis-[72%] sm:basis-1/2">
                <PlanCard plan={plan} />
              </CarouselItem>
            ))}
            <CarouselItem className="basis-[44%] sm:basis-1/3">
              {/* As telas de plano são da #378: daqui só se chega até elas. */}
              <Link
                href="/workout/plans"
                className="anim-press flex h-full min-h-44 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-subtle text-muted-foreground"
              >
                <Plus size={22} aria-hidden />
                <span className="text-sm font-bold">Novo plano</span>
              </Link>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}

function OtherWays({ onCardio }: { onCardio: () => void }) {
  const start = useStartSession();
  const option =
    'anim-press flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-3xl bg-card p-4 text-left border border-subtle disabled:opacity-60';
  return (
    <section aria-labelledby="treino-outros" className="space-y-2">
      <h2 id="treino-outros" className={sectionTitle}>
        Outros jeitos de treinar
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className={option}
          disabled={start.isPending}
          onClick={() => start.mutate(null)}
        >
          <Dumbbell size={18} className="text-primary" aria-hidden />
          <span>
            <span className="block text-sm font-extrabold text-foreground">Livre</span>
            <span className="block text-xs text-muted-foreground">Monte na hora</span>
          </span>
        </button>
        <button
          type="button"
          className={option}
          disabled={start.isPending}
          onClick={() => start.mutate(null, { onSuccess: onCardio })}
        >
          <HeartPulse size={18} className="text-primary" aria-hidden />
          <span>
            <span className="block text-sm font-extrabold text-foreground">Só cardio</span>
            <span className="block text-xs text-muted-foreground">Corrida, bike, escada</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Zap size={14} className="text-muted-foreground" aria-hidden />
        <h3 className="text-[13px] font-bold text-muted-foreground">Treinos rápidos</h3>
      </div>
      <Carousel opts={{ align: 'start', dragFree: true }}>
        <CarouselContent>
          {QUICK_TEMPLATES.map((q) => (
            <CarouselItem key={q.id} className="basis-[72%] sm:basis-1/2">
              <Link
                href={`/workout/quick/${q.id}`}
                className={`relative block h-40 w-full overflow-hidden rounded-3xl bg-gradient-to-br ${q.gradient}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={q.image}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                  <p className="text-[10px] font-bold text-white/70">{q.level}</p>
                  <p className="mt-1 text-base font-extrabold leading-tight text-white">
                    {q.title}
                  </p>
                  <p className="mt-1 text-[11px] text-white/70">
                    {q.duration} • {q.location}
                  </p>
                </div>
              </Link>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  );
}

/**
 * O início da aba Treino (prancha Al-T1): semana, cards, planos e os outros
 * jeitos de começar. A periodização, consultada uma vez por bloco, fica no fim.
 */
export function WorkoutHome({ onCardio }: { onCardio: () => void }) {
  const muscles = useQuery({
    queryKey: ['workout', 'muscles', 'week'],
    queryFn: () => workoutApi.getWeeklyMuscleSummary(),
  });

  return (
    <div className="space-y-6 px-5 pt-2 pb-4">
      <TabHeader title="Treino">
        <Link href="/workout/history" aria-label="Histórico" className={headerButtonClass()}>
          <History size={20} aria-hidden />
        </Link>
        <Link href="/workout/plans" aria-label="Novo plano" className={headerButtonClass()}>
          <Plus size={20} aria-hidden />
        </Link>
      </TabHeader>

      {/* TODO(#379): aviso de plano recebido da equipe entra aqui, acima da semana. */}

      {muscles.data?.week && <WeekStrip week={muscles.data.week} />}

      <WorkoutCardsCarousel />

      <PlansSection />

      <OtherWays onCardio={onCardio} />

      <section aria-labelledby="treino-periodizacao" className="space-y-2">
        <h2 id="treino-periodizacao" className={sectionTitle}>
          Periodização
        </h2>
        <BlockTimeline />
      </section>
    </div>
  );
}

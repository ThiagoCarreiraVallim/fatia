'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Heart, History, Plus, Timer, Zap } from 'lucide-react';
import {
  blockRow,
  dayOfMonth,
  planCardInfo,
  planExercisePreview,
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
import { ReceivedOfferNotice } from './received-offer-notice';

const sectionTitle = 'font-display text-[17px] font-semibold text-foreground';

/**
 * A faixa da semana (prancha Al-T1), no mesmo desenho do `DayStrip` da
 * Nutrição: hoje em verde, os dias treinados contornados.
 */
function WeekStrip({ week }: { week: TrainingWeek }) {
  return (
    <section aria-labelledby="treino-semana" className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 id="treino-semana" className={sectionTitle}>
          Semana
        </h2>
        <span className="text-[13px] text-muted-foreground">{trainingWeekLabel(week)}</span>
      </div>
      <ol className="flex justify-between gap-1.5">
        {week.days.map((d, i) => {
          const day = dayOfMonth(d.date);
          const chip = (
            <>
              <span aria-hidden className="text-xs font-semibold">
                {WEEKDAY_LETTERS[i]}
              </span>
              <b
                aria-hidden
                className={cn('font-display text-base tabular-nums', !d.today && 'text-foreground')}
              >
                {day}
              </b>
            </>
          );
          const tone = cn(
            'flex h-16 flex-col items-center justify-center gap-0.5 rounded-field',
            d.today
              ? 'bg-primary text-primary-foreground'
              : cn(
                  'bg-muted text-faint',
                  (d.trained || d.active) &&
                    'shadow-[inset_0_0_0_1.5px_hsl(var(--primary-text)/0.5)]',
                ),
          );
          const label = `Dia ${day}${d.today ? ', hoje' : ''}${
            d.active ? ', treino em andamento' : d.trained ? ', treinou' : ''
          }`;
          return (
            <li key={d.date} className="flex-1" aria-current={d.today ? 'date' : undefined}>
              {d.trained ? (
                <Link href="/workout/history" aria-label={label} className={cn(tone, 'anim-press')}>
                  {chip}
                </Link>
              ) : (
                <div aria-label={label} className={tone}>
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

/** O cartão do plano (prancha Al-T1): o cartão inteiro abre o plano. */
function PlanCard({ plan }: { plan: WorkoutPlan }) {
  const preview = planExercisePreview(plan);
  const bars = planMuscleBars(plan);
  return (
    <Link
      href={`/workout/plans/${plan.id}`}
      className="anim-press flex h-full min-w-0 flex-col gap-2.5 rounded-card bg-card p-4"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[17px] font-bold text-foreground">{plan.name}</span>
        <span className="shrink-0 rounded-pill bg-primary-soft px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-primary-text">
          Seu
        </span>
      </span>
      <span className="text-[13px] text-muted-foreground">{planCardInfo(plan)}</span>
      {preview && <span className="truncate text-sm text-foreground">{preview}</span>}
      {bars.length > 0 && (
        <span aria-hidden className="mt-auto flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {bars.map((b) => (
            <span
              key={b.group}
              style={{ width: `${b.share * 100}%`, background: groupTone(b.group) }}
              className="block h-full"
            />
          ))}
        </span>
      )}
    </Link>
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
            {/* Os circuitos têm o atalho deles em "Outros jeitos de treinar". */}
            {plans.data
              .filter((plan) => plan.kind !== 'CIRCUIT')
              .map((plan) => (
                <CarouselItem key={plan.id} className="basis-[58%] sm:basis-1/3">
                  <PlanCard plan={plan} />
                </CarouselItem>
              ))}
            <CarouselItem className="basis-[36%] sm:basis-1/4">
              {/* As telas de plano são da #378: daqui só se chega até elas. */}
              <Link
                href="/workout/plans"
                className="anim-press flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-card text-muted-foreground shadow-[inset_0_0_0_1.5px_hsl(var(--border-strong))]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Plus size={16} aria-hidden />
                </span>
                <span className="text-sm font-bold text-foreground">Novo plano</span>
              </Link>
            </CarouselItem>
          </CarouselContent>
        </Carousel>
      )}
    </section>
  );
}

/** Um jeito de começar (prancha Al-T1): ícone num quadrado de cor, nome e dica. */
function WayTile({
  title,
  hint,
  icon,
  tone,
  disabled,
  onClick,
  href,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  tone: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Leva a outra tela em vez de começar uma sessão. */
  href?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tone)}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </>
  );
  const className =
    'anim-press flex min-w-0 items-center gap-2.5 rounded-[18px] bg-card p-3 text-left disabled:opacity-60';
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function OtherWays({ onCardio }: { onCardio: () => void }) {
  const start = useStartSession();
  // Quem já tem circuito cai na lista deles (Al-T6); quem não tem, no Novo circuito (Al-T22).
  const plans = useQuery({ queryKey: ['workout', 'plans'], queryFn: () => workoutApi.listPlans() });
  const hasCircuits = plans.data?.some((p) => p.kind === 'CIRCUIT') ?? false;
  return (
    <section aria-labelledby="treino-outros" className="space-y-2.5">
      <h2 id="treino-outros" className={sectionTitle}>
        Outros jeitos de treinar
      </h2>
      {/* Modelos entra com a #379. */}
      <div className="grid grid-cols-2 gap-2">
        <WayTile
          title="Livre"
          hint="monte na hora"
          icon={<Zap size={16} />}
          tone="bg-primary-soft text-primary-text"
          disabled={start.isPending}
          onClick={() => start.mutate(null)}
        />
        <WayTile
          title="Só cardio"
          hint="esteira, bike…"
          icon={<Heart size={16} />}
          tone="bg-danger/15 text-danger"
          disabled={start.isPending}
          onClick={() => start.mutate(null, { onSuccess: onCardio })}
        />
        <WayTile
          title="Circuito"
          hint="AMRAP, EMOM"
          icon={<Timer size={16} />}
          tone="bg-warning/15 text-warning"
          href={hasCircuits ? '/workout/plans?tab=circuitos' : '/workout/circuits/new'}
        />
      </div>
    </section>
  );
}

/**
 * Os treinos rápidos não estão na prancha (os "Modelos" da #379 tomam o lugar
 * deles): ficam no fim, depois do bloco, para não sumirem antes disso.
 */
function QuickTemplates() {
  return (
    <section aria-labelledby="treino-rapidos" className="space-y-2.5">
      <h2 id="treino-rapidos" className={sectionTitle}>
        Treinos rápidos
      </h2>
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
 * O bloco numa linha (prancha Al-T1: "Bloco hipertrofia · semana 2 de 4" e as
 * barras de volume). O toque abre o detalhe e o encerrar, ou o montar sem bloco.
 */
function BlockRow() {
  const [open, setOpen] = useState(false);
  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });
  if (block.isLoading) return null;
  const row = block.data ? blockRow(block.data) : null;
  return (
    <section aria-label="Periodização" className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="anim-press flex w-full items-center gap-3 rounded-card bg-card px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">
            {row ? row.title : 'Periodização em blocos'}
          </span>
          <span className="block text-xs text-muted-foreground">
            {row ? row.detail : 'de 3 a 6 semanas, com deload no fim'}
          </span>
        </span>
        {row && (
          <span aria-hidden className="flex h-7 items-end gap-1">
            {row.bars.map((b, i) => (
              <span
                key={i}
                style={{ height: `${Math.max(0.3, b.ratio) * 100}%` }}
                className={cn(
                  'block w-2.5 rounded-[3px]',
                  b.reached ? 'bg-primary' : 'bg-surface-3',
                )}
              />
            ))}
          </span>
        )}
        <ChevronRight
          size={16}
          aria-hidden
          className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')}
        />
      </button>
      {open && <BlockTimeline />}
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
        <Link href="/workout/agenda" aria-label="Agenda" className={headerButtonClass()}>
          <CalendarDays size={20} aria-hidden />
        </Link>
        <Link href="/workout/history" aria-label="Histórico" className={headerButtonClass()}>
          <History size={20} aria-hidden />
        </Link>
        <Link href="/workout/plans" aria-label="Novo plano" className={headerButtonClass()}>
          <Plus size={20} aria-hidden />
        </Link>
      </TabHeader>

      <ReceivedOfferNotice />

      {muscles.data?.week && <WeekStrip week={muscles.data.week} />}

      <WorkoutCardsCarousel />

      <PlansSection />

      <OtherWays onCardio={onCardio} />

      <BlockRow />

      <QuickTemplates />
    </div>
  );
}

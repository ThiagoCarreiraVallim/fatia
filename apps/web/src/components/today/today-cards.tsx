'use client';

import Link from 'next/link';
import {
  formatDecimal,
  formatInteger,
  nextWorkoutCopy,
  nextWorkoutDetail,
  personalGoalProgress,
  rotuloDeSequencia,
  stepsTargetShort,
  weightChange30dLabel,
  type Goal,
  type NextEvent,
  type ReceivedPlan,
  type TodaySummary,
  type TodoItem,
} from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { Ring } from '@/components/ui/data-blocks';
import { cn } from '@/lib/utils';
import { Bar, ChipIcon, Eyebrow, stagger, todayCard, todayTile } from './parts';

/**
 * Os cartões da aba Hoje (prancha Al-H1-Hoje), na ordem da prancha. Cartão de
 * dado que ainda não existe (pedido da equipe, treino recebido, evento) não é
 * desenhado: some sem deixar buraco.
 */

const TODO_ICON = { assessment: 'ruler', plan_offer: 'dumbbell', questionnaire: 'review' } as const;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/** "Novo treino da Helena": faixa na cor da comunidade, com "Ver". */
export function ReceivedPlanBanner({ plan }: { plan: ReceivedPlan }) {
  return (
    <Link
      href={plan.href}
      style={stagger(0)}
      className="anim-up flex items-center gap-3 rounded-card bg-primary-soft px-4 py-3.5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2f4a7a] font-display text-[11px] font-bold text-[#dbe6ff]"
      >
        {initials(plan.fromName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-foreground">{plan.title}</span>
        <span className="block text-b2 text-muted-foreground">{plan.subtitle}</span>
      </span>
      <span className="inline-flex h-[34px] items-center rounded-chip bg-primary px-3.5 text-[13px] font-bold text-primary-foreground">
        Ver
      </span>
    </Link>
  );
}

/** "Para fazer": pedidos da equipe, com a contagem na cor da comunidade. */
export function TodoCard({ todo }: { todo: { count: number; items: TodoItem[] } }) {
  return (
    <section
      aria-label="Para fazer"
      style={stagger(1)}
      className={cn(todayCard, 'gap-1.5 px-4 pb-2 pt-3.5')}
    >
      <div className="flex min-h-8 items-center gap-2">
        <h2 className="text-[15px] font-bold">Para fazer</h2>
        <span className="inline-flex h-[22px] items-center rounded-pill bg-brand px-2 text-[11px] font-extrabold text-brand-foreground">
          {todo.count}
        </span>
      </div>
      <ul>
        {todo.items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="shadow-[inset_0_1px_0_hsl(var(--border))]">
            <Link href={item.href} className="flex min-h-12 items-center gap-3 py-2">
              <ChipIcon icon={TODO_ICON[item.kind]} tone="brand" size={34} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-sm font-semibold">{item.title}</span>
                <span className="truncate text-xs text-faint">{item.subtitle}</span>
              </span>
              <Icon name="chevR" size={16} className="text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Evento do dia: "Vou" antes da aula; depois, "Foi?" e registrar a aula. */
export function EventCard({ event }: { event: NextEvent }) {
  if (event.past) {
    return (
      <section
        aria-label={event.title}
        style={stagger(1)}
        className={cn(
          todayCard,
          'gap-2.5 px-4 py-3.5 shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]',
        )}
      >
        <div className="flex items-center gap-3">
          <ChipIcon icon="cal" tone="lime" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{event.title}</p>
            <p className="text-b2 text-muted-foreground">Você marcou Vou. Foi?</p>
          </div>
        </div>
        <Link
          href={event.href}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-field bg-primary text-[15px] font-bold text-primary-foreground"
        >
          Registrar a aula{event.durationMin ? ` · ${event.durationMin} min` : ''}
        </Link>
      </section>
    );
  }
  return (
    <Link
      href={event.href}
      style={stagger(1)}
      className={cn(
        todayCard,
        'flex-row items-center gap-3 px-4 py-3.5 shadow-[inset_0_0_0_1.5px_hsl(var(--brand))]',
      )}
    >
      <ChipIcon icon="cal" tone="brand" />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{event.title}</span>
        <span className="block text-b2 text-muted-foreground">{event.subtitle}</span>
      </span>
      {event.going && (
        <span className="inline-flex h-[22px] items-center rounded-pill bg-brand px-2.5 text-[11px] font-extrabold uppercase text-brand-foreground">
          Vou
        </span>
      )}
    </Link>
  );
}

function mid(min: number, max: number) {
  return Math.round((min + max) / 2);
}

/** Calorias que restam no anel e as três barras de macro. Leva ao dia de Nutrição. */
export function KcalCard({ nutrition }: { nutrition: TodaySummary['nutrition'] }) {
  const { consumed, goals } = nutrition;
  const target = goals ? mid(goals.kcalMin, goals.kcalMax) : 0;
  const remaining = Math.max(0, target - Math.round(consumed.kcal));
  const macros = [
    {
      label: 'Prot',
      cur: consumed.proteinG,
      tgt: goals ? mid(goals.proteinMinG, goals.proteinMaxG) : 0,
      color: 'bg-protein',
    },
    {
      label: 'Carb',
      cur: consumed.carbsG,
      tgt: goals ? mid(goals.carbsMinG, goals.carbsMaxG) : 0,
      color: 'bg-carbs',
    },
    {
      label: 'Gord',
      cur: consumed.fatG,
      tgt: goals ? mid(goals.fatMinG, goals.fatMaxG) : 0,
      color: 'bg-fat',
    },
  ];
  return (
    <Link
      href="/nutrition"
      aria-label={
        goals
          ? `Nutrição: restam ${formatInteger(remaining)} kcal`
          : `Nutrição: ${formatInteger(consumed.kcal)} kcal hoje`
      }
      style={stagger(1)}
      className={cn(todayCard, 'flex-row items-center gap-[18px]')}
    >
      <Ring
        value={goals ? Math.round(consumed.kcal) : 0}
        max={target || 1}
        size={132}
        stroke={13}
        label={goals ? 'restam' : 'kcal hoje'}
      >
        <span className="font-display text-d3 tabular-nums">
          {formatInteger(goals ? remaining : consumed.kcal)}
        </span>
        <span className="text-xs text-faint">{goals ? 'restam' : 'kcal hoje'}</span>
      </Ring>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {goals ? (
          macros.map((m, i) => (
            <div key={m.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-faint">
                <span>{m.label}</span>
                <span className="tabular-nums">
                  {formatInteger(m.cur)}/{formatInteger(m.tgt)}
                </span>
              </div>
              <Bar percent={m.tgt > 0 ? (m.cur / m.tgt) * 100 : 0} color={m.color} index={i} />
            </div>
          ))
        ) : (
          <p className="text-b2 text-muted-foreground">
            Defina suas metas para ver quanto resta de cada macro.
          </p>
        )}
      </div>
    </Link>
  );
}

/** O cartão verde do próximo treino, com o play. */
export function NextWorkoutCard({ workout }: { workout: TodaySummary['workout'] }) {
  const copy = nextWorkoutCopy(workout, (iso) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  );
  const detail =
    !workout.sessionInProgress && !workout.completedToday && workout.nextPlan
      ? (nextWorkoutDetail(workout.nextPlan.exerciseCount ?? null) ?? copy.subtitle)
      : copy.subtitle;
  return (
    <Link
      href={copy.href}
      style={stagger(2)}
      className={cn(
        todayCard,
        'flex-row items-center gap-3.5 bg-primary py-4 pl-5 pr-4 text-primary-foreground',
      )}
    >
      <div className="min-w-0 flex-1">
        <Eyebrow className="uppercase">{copy.badge}</Eyebrow>
        <p className="truncate font-display text-h2">{copy.title}</p>
        <p className="text-[13px] font-semibold opacity-75">{detail}</p>
      </div>
      <span
        aria-hidden
        className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-field bg-primary-foreground text-[hsl(var(--primary))]"
      >
        <Icon name="play" size={24} />
      </span>
    </Link>
  );
}

/** Água do dia: a gota abre a folha de água; o "+" soma um copo. */
export function WaterTile({
  water,
  onOpen,
  onAdd,
  adding,
}: {
  water: TodaySummary['water'];
  onOpen: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const target = water.targetMl ?? 2500;
  return (
    <div style={stagger(3)} className={todayTile}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Abrir água"
          className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-field text-water"
        >
          <Icon name="drop" size={22} />
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          aria-label="Água +250"
          className="anim-press inline-flex h-9 w-9 items-center justify-center rounded-field bg-muted text-foreground after:absolute disabled:opacity-50"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      <button type="button" onClick={onOpen} className="text-left" tabIndex={-1} aria-hidden>
        <span className="font-display text-[26px] font-bold tabular-nums">
          {formatInteger(water.todayMl)}
        </span>
        <span className="text-xs text-faint"> /{formatDecimal(target / 1000)} L</span>
      </button>
      <Bar
        percent={(water.todayMl / target) * 100}
        color="bg-water"
        label="Meta de água"
        animate={false}
      />
    </div>
  );
}

/** Passos do dia, com o percentual da meta. Abre o registro de passos. */
export function StepsTile({ steps, onOpen }: { steps: TodaySummary['steps']; onOpen: () => void }) {
  const pct = steps.target ? Math.min(100, Math.round((steps.today / steps.target) * 100)) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Passos: ${formatInteger(steps.today)}${steps.target ? ` de ${formatInteger(steps.target)}` : ''}`}
      style={stagger(4)}
      className={cn(todayTile, 'text-left')}
    >
      <span className="flex items-center justify-between">
        <Icon name="steps" size={22} className="text-steps" />
        {pct !== null && <span className="text-xs text-faint">{pct}%</span>}
      </span>
      <span>
        <span className="font-display text-[26px] font-bold tabular-nums">
          {formatInteger(steps.today)}
        </span>
        {steps.target ? (
          <span className="text-xs text-faint"> {stepsTargetShort(steps.target)}</span>
        ) : null}
      </span>
      <Bar percent={pct ?? 0} color="bg-steps" index={1} />
    </button>
  );
}

/** Peso mais recente e a variação de 30 dias. Abre a folha de peso. */
export function WeightTile({
  weight,
  onOpen,
}: {
  weight: TodaySummary['weight'];
  onOpen: () => void;
}) {
  const change = weightChange30dLabel(weight.change30dKg);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        weight.latest
          ? `Peso: ${formatDecimal(weight.latest.weightKg)} kg${change ? `, ${change}` : ''}`
          : 'Registrar peso'
      }
      style={stagger(5)}
      className={cn(todayTile, 'text-left')}
    >
      <Icon name="scale" size={22} className="text-muted-foreground" />
      <span>
        <span className="font-display text-[26px] font-bold">
          {weight.latest ? formatDecimal(weight.latest.weightKg) : '—'}
        </span>
        <span className="text-xs text-faint"> kg</span>
      </span>
      <span className={cn('text-xs', change ? 'text-primary' : 'text-faint')}>
        {change ?? (weight.latest ? 'sem variação em 30 dias' : 'registrar peso')}
      </span>
    </button>
  );
}

/** Sequência de dias ativos. Leva à semana, em Progresso. */
export function StreakTile({ streak }: { streak: TodaySummary['streak'] }) {
  return (
    <Link href="/progress" style={stagger(6)} className={todayTile}>
      <Icon name="flame" size={22} className="text-warning" />
      <span aria-label={rotuloDeSequencia(streak.activeDays, 'dias')}>
        <span aria-hidden className="font-display text-[26px] font-bold">
          {streak.activeDays.periodos}
          {streak.activeDays.janelaEsgotada ? '+' : ''}
        </span>
        <span aria-hidden className="text-xs text-faint">
          {' '}
          {streak.activeDays.periodos === 1 ? 'dia' : 'dias'}
        </span>
      </span>
      <span className="text-xs text-faint">sequência · ver semana</span>
    </Link>
  );
}

/** Metas pessoais ativas, com o progresso de cada uma. */
export function PersonalGoalsCard({
  goals,
  loading,
}: {
  goals: Goal[] | undefined;
  loading: boolean;
}) {
  const active = goals ?? [];
  return (
    <section aria-label="Metas pessoais" style={stagger(7)} className={todayCard}>
      <Link href="/goals" className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold">Metas pessoais</h2>
        <span className="flex items-center gap-1 text-xs text-faint">
          {loading ? '…' : active.length === 1 ? '1 ativa' : `${active.length} ativas`}
          <Icon name="chevR" size={16} />
        </span>
      </Link>
      {loading ? (
        <div className="h-10 animate-pulse rounded-field bg-muted" aria-hidden />
      ) : active.length === 0 ? (
        <Link
          href="/goals"
          className="text-b2 text-muted-foreground underline-offset-4 hover:underline"
        >
          Nenhuma meta ativa. Criar uma meta
        </Link>
      ) : (
        active.slice(0, 3).map((g, i) => {
          const p = personalGoalProgress(g);
          return (
            <Link key={g.id} href="/goals" className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold">{g.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-faint">{p.text}</span>
              </span>
              <Bar
                percent={p.percent}
                color={i % 2 === 0 ? 'bg-primary' : 'bg-protein'}
                index={i}
              />
            </Link>
          );
        })
      )}
    </section>
  );
}

'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  dayShareCard,
  dayShareMessage,
  goalsApi,
  goalsChipLabel,
  greetingLine,
  todayDateLine,
  INBOX_EMPTY_TOAST,
  progressApi,
  usersApi,
  waterAddedToast,
  WATER_GLASS_ML,
  whatsappShareUrl,
  type ShareTarget,
  type TodaySummary,
} from '@fatia/api-client';
import { headerButtonClass } from '@/components/layout/tab-header';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { ShareSheet } from '@/components/sharing/share-sheet';
import type { ShareIdentity } from '@/components/sharing/share-card';
import {
  EventCard,
  KcalCard,
  NextWorkoutCard,
  PersonalGoalsCard,
  ReceivedPlanBanner,
  StepsTile,
  StreakTile,
  TodoCard,
  WaterTile,
  WeightTile,
} from '@/components/today/today-cards';
import { FirstStepsCard } from '@/components/today/first-steps-card';
import { GoalsSheet } from '@/components/today/goals-sheet';
import { InboxSheet } from '@/components/today/inbox-sheet';
import { WaterSheet } from '@/components/today/water-sheet';
import { WeightSheet } from '@/components/today/weight-sheet';
import { cn } from '@/lib/utils';

const noSubscription = () => () => undefined;

function shareInput(data: TodaySummary) {
  return { ...data, streakDays: data.streak.activeDays.periodos };
}

type Sheet = 'goals' | 'water' | 'weight' | 'steps' | 'share' | 'inbox' | null;

const DASHBOARD_KEY = ['dashboard', 'today'] as const;

/**
 * Hoje (prancha Al-H1-Hoje): topo com data, chip das metas do dia, saudação e
 * sino; depois os cartões na ordem da prancha. Água, peso, passos e metas abrem
 * folhas por cima do Hoje (Al-H3, Al-H4, Al-H5).
 */
export default function HomePage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  // A saudação depende da hora local: no servidor (UTC) sairia "Boa noite" para
  // quem lê às 18h em São Paulo, e a hidratação quebrava. Só o cliente a calcula.
  const greeting = useSyncExternalStore(
    noSubscription,
    () => greetingLine(me.data?.name),
    () => null,
  );
  // "Sáb, 14 nov": do relógio local, pelo mesmo motivo da saudação.
  const dateLine = useSyncExternalStore(
    noSubscription,
    () => todayDateLine(),
    () => null,
  );
  const today = useQuery({ queryKey: DASHBOARD_KEY, queryFn: () => progressApi.today() });
  const data = today.data;

  // O `today()` só LÊ as conquistas; quem desbloqueia é esta chamada, idempotente.
  useQuery({
    queryKey: ['achievements', 'refresh'],
    queryFn: () => progressApi.refreshAchievements(),
  });
  const personal = useQuery({
    queryKey: ['goals', 'active'],
    queryFn: () => goalsApi.list({ status: 'active' }),
  });

  const [sheet, setSheet] = useState<Sheet>(null);
  const closeOn = (o: boolean) => {
    if (!o) setSheet(null);
  };

  // O "+" do cartão de água: um copo, e o total novo no toast.
  const addGlass = useMutation({
    mutationFn: () => progressApi.createWater({ ml: WATER_GLASS_ML }),
    onSuccess: () => {
      const total = (data?.water.todayMl ?? 0) + WATER_GLASS_ML;
      qc.setQueryData<TodaySummary>(DASHBOARD_KEY, (old) =>
        old ? { ...old, water: { ...old.water, todayMl: total } } : old,
      );
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['water-logs'] });
      toast(waterAddedToast(WATER_GLASS_ML, total));
    },
    onError: () => toast('Não deu para registrar a água. Tente de novo.'),
  });

  function openInbox() {
    if (!data || data.inbox.unread === 0) {
      toast(INBOX_EMPTY_TOAST);
      return;
    }
    setSheet('inbox');
  }

  async function share(target: ShareTarget, identity: ShareIdentity) {
    if (!data) return;
    const card = dayShareCard(shareInput(data));
    const text = dayShareMessage(card, identity.as === 'none' ? null : identity.value);
    setSheet(null);
    if (target === 'whatsapp') {
      window.open(whatsappShareUrl(text), '_blank', 'noopener');
      return;
    }
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast('Texto copiado');
    } catch {
      // A pessoa fechou a folha do sistema: nada a avisar.
    }
  }

  const goals = data?.dailyGoals;

  return (
    <div className="flex flex-col gap-4 px-6 pb-4 pt-6">
      {/* Topo (Al-H1): data e chip das metas, saudação, e o sino com ponto de não lido. */}
      <section className="mb-1.5 flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-b2 text-muted-foreground">{dateLine ?? ' '}</p>
            {goals && goals.total > 0 ? (
              <button
                type="button"
                onClick={() => setSheet('goals')}
                aria-label={`Metas do dia: ${goals.met} de ${goals.total}`}
                className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-card px-2.5 text-xs font-semibold text-muted-foreground"
              >
                <Icon name="target" size={16} className="text-primary" />
                {goalsChipLabel(goals.met, goals.total)}
              </button>
            ) : goals ? (
              <Link
                href="/nutrition/goals"
                className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-card px-2.5 text-xs font-semibold text-muted-foreground"
              >
                <Icon name="target" size={16} className="text-primary" />
                Definir metas
              </Link>
            ) : null}
          </div>
          <h1 className="font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground">
            {greeting ?? ' '}
          </h1>
        </div>
        <button
          type="button"
          onClick={openInbox}
          aria-label={data && data.inbox.unread > 0 ? 'Avisos, há avisos novos' : 'Avisos'}
          className={cn(headerButtonClass(), 'relative')}
        >
          <Icon name="bell" size={20} />
          {data && data.inbox.unread > 0 && (
            <span
              aria-hidden
              data-testid="inbox-dot"
              className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-card"
            />
          )}
        </button>
      </section>

      {today.isLoading && (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-[172px]" />
          <Skeleton className="h-[96px]" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
          </div>
        </div>
      )}

      {/* Como no app: sem isto, a falha deixava o Hoje só com a saudação. */}
      {today.isError && (
        <ErrorState
          message="Não deu para carregar o resumo de hoje."
          onRetry={() => void today.refetch()}
        />
      )}

      {data && (
        <>
          <FirstStepsCard />
          {data.receivedPlan && <ReceivedPlanBanner plan={data.receivedPlan} />}
          {data.todo.count > 0 && <TodoCard todo={data.todo} />}
          {data.nextEvent && <EventCard event={data.nextEvent} />}
          <KcalCard nutrition={data.nutrition} />
          <NextWorkoutCard workout={data.workout} />
          <div className="grid grid-cols-2 gap-3">
            <WaterTile
              water={data.water}
              onOpen={() => setSheet('water')}
              onAdd={() => addGlass.mutate()}
              adding={addGlass.isPending}
            />
            <StepsTile steps={data.steps} onOpen={() => setSheet('steps')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <WeightTile weight={data.weight} onOpen={() => setSheet('weight')} />
            <StreakTile streak={data.streak} />
          </div>
          <PersonalGoalsCard goals={personal.data} loading={personal.isLoading} />

          <GoalsSheet
            open={sheet === 'goals'}
            onOpenChange={closeOn}
            goals={data.dailyGoals}
            onWater={() => setSheet('water')}
            onSteps={() => setSheet('steps')}
            onShare={() => setSheet('share')}
          />
          <WaterSheet
            open={sheet === 'water'}
            onOpenChange={closeOn}
            targetMl={data.water.targetMl ?? 2500}
          />
          <WeightSheet open={sheet === 'weight'} onOpenChange={closeOn} />
          <LogStepsDrawer open={sheet === 'steps'} onClose={() => setSheet(null)} />
          <InboxSheet open={sheet === 'inbox'} onOpenChange={closeOn} />
          <ShareSheet
            open={sheet === 'share'}
            onOpenChange={closeOn}
            data={dayShareCard(shareInput(data))}
            person={{ name: me.data?.name ?? 'Você', handle: null }}
            onShare={(t, id) => void share(t, id)}
          />
        </>
      )}
    </div>
  );
}

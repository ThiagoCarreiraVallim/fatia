'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { greetingLine, progressApi, usersApi } from '@fatia/api-client';
import { NutritionMacroCard } from '@/components/dashboard/nutrition-macro-card';
import { NextWorkoutCard } from '@/components/dashboard/next-workout-card';
import { StepsCard } from '@/components/dashboard/steps-card';
import { StreakCard } from '@/components/dashboard/streak-card';
import { WaterCard } from '@/components/dashboard/water-card';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';

const noSubscription = () => () => undefined;

export default function HomePage() {
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
    () =>
      new Date()
        .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
        .replace(/\./g, ''),
    () => null,
  );
  const today = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => progressApi.today(),
  });
  const data = today.data;

  // O `today()` só LÊ as conquistas — desbloquear dentro de um `GET` fazia a leitura gravar.
  // Quem desbloqueia é esta chamada. É `useQuery` mesmo sendo `POST` porque a operação é
  // idempotente e o que interessa é o estado que ela devolve; enquanto ela não chega, o card
  // usa o que veio do dashboard para não piscar vazio.
  const { data: achievements } = useQuery({
    queryKey: ['achievements', 'refresh'],
    queryFn: () => progressApi.refreshAchievements(),
  });

  return (
    <div className="space-y-5 px-5 pt-6 pb-4">
      {/* Topo do Hoje (ADR 040 revisada, item 4): data, saudação, as metas do dia
          e o sino dos avisos, sozinho — a pessoa chega a Você pela aba. O sino
          leva às notificações até a caixa de avisos da #389. */}
      <section className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-b2 capitalize text-muted-foreground">{dateLine ?? '\u00a0'}</p>
          <h1 className="font-display text-h2 text-foreground">{greeting ?? '\u00a0'}</h1>
        </div>
        {/* As metas do dia a um toque: antes eram Progresso → Perfil → Metas. */}
        <Link
          href="/nutrition/goals"
          aria-label="Metas do dia"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="target" size={20} />
        </Link>
        <Link
          href="/profile/notifications"
          aria-label="Avisos"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="bell" size={20} />
        </Link>
      </section>

      {today.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-20" />
        </div>
      )}

      {/* Como no app: sem isto, a falha deixava o Início só com a saudação. */}
      {today.isError && (
        <ErrorState
          message="Não deu para carregar o resumo de hoje."
          onRetry={() => void today.refetch()}
        />
      )}

      {data && (
        <>
          <NutritionMacroCard nutrition={data.nutrition} />
          <NextWorkoutCard workout={data.workout} />
          <WaterCard data={data.water} />
          <StepsCard data={data.steps} />
          <StreakCard streak={data.streak} achievements={achievements ?? data.achievements} />
        </>
      )}
    </div>
  );
}

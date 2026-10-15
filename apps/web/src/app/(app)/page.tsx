'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { greetingLine, progressApi, usersApi } from '@fatia/api-client';
import { NutritionMacroCard } from '@/components/dashboard/nutrition-macro-card';
import { NextWorkoutCard } from '@/components/dashboard/next-workout-card';
import { StepsCard } from '@/components/dashboard/steps-card';
import { StreakCard } from '@/components/dashboard/streak-card';
import { WaterCard } from '@/components/dashboard/water-card';
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
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => progressApi.today(),
  });

  // O `today()` só LÊ as conquistas — desbloquear dentro de um `GET` fazia a leitura gravar.
  // Quem desbloqueia é esta chamada. É `useQuery` mesmo sendo `POST` porque a operação é
  // idempotente e o que interessa é o estado que ela devolve; enquanto ela não chega, o card
  // usa o que veio do dashboard para não piscar vazio.
  const { data: conquistas } = useQuery({
    queryKey: ['achievements', 'refresh'],
    queryFn: () => progressApi.refreshAchievements(),
  });

  return (
    <div className="space-y-5 px-5 pt-6 pb-4">
      <section className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-semibold text-foreground">{greeting ?? '\u00a0'}</h1>
          <p className="text-sm text-muted-foreground">Pronto para dominar o dia?</p>
        </div>
        {/* As metas do dia a um toque: antes eram Progresso → Perfil → Metas. */}
        <Link
          href="/nutrition/goals"
          aria-label="Metas do dia"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Target size={16} className="text-primary" aria-hidden />
          Metas
        </Link>
      </section>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[160px]" />
          <Skeleton className="h-20" />
        </div>
      )}

      {data && (
        <>
          <NutritionMacroCard nutrition={data.nutrition} />
          <NextWorkoutCard workout={data.workout} />
          <WaterCard data={data.water} />
          <StepsCard data={data.steps} />
          <StreakCard streak={data.streak} achievements={conquistas ?? data.achievements} />
        </>
      )}
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@fatia/api-client';
import { NutritionMacroCard } from '@/components/dashboard/nutrition-macro-card';
import { NextWorkoutCard } from '@/components/dashboard/next-workout-card';
import { QuickLogActions } from '@/components/dashboard/quick-log-actions';
import { StepsCard } from '@/components/dashboard/steps-card';
import { StreakCard } from '@/components/dashboard/streak-card';
import { WaterCard } from '@/components/dashboard/water-card';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomePage() {
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
      {/* Welcome */}
      <section>
        <h1 className="text-[18px] font-semibold text-foreground">{greeting()}, Atleta.</h1>
        <p className="text-sm text-muted-foreground">Pronto para dominar o dia?</p>
      </section>

      {isLoading && (
        <div className="space-y-4">
          <div className="h-[200px] animate-pulse rounded-xl bg-card" />
          <div className="h-[160px] animate-pulse rounded-xl bg-card" />
          <div className="h-20 animate-pulse rounded-xl bg-card" />
        </div>
      )}

      {data && (
        <>
          <NutritionMacroCard nutrition={data.nutrition} />
          <NextWorkoutCard workout={data.workout} />
          <WaterCard data={data.water} />
          <StepsCard data={data.steps} />
          <StreakCard streak={data.streak} achievements={conquistas ?? data.achievements} />
          <QuickLogActions />
        </>
      )}
    </div>
  );
}

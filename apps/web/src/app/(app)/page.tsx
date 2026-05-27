'use client';

import { useQuery } from '@tanstack/react-query';
import { progressApi } from '@/lib/api/progress';
import { NutritionMacroCard } from '@/components/dashboard/nutrition-macro-card';
import { NextWorkoutCard } from '@/components/dashboard/next-workout-card';
import { QuickLogActions } from '@/components/dashboard/quick-log-actions';
import { StepsCard } from '@/components/dashboard/steps-card';
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
          <QuickLogActions />
        </>
      )}
    </div>
  );
}

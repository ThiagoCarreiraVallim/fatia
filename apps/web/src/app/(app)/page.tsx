'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Apple, Dumbbell, Scale } from 'lucide-react';
import { progressApi } from '@/lib/api/progress';
import { StepsCard } from '@/components/dashboard/steps-card';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomePage() {
  const today = useQuery({ queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() });

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">{greeting()}</h1>
        <p className="text-sm text-muted-foreground">
          {today.data?.date ??
            new Intl.DateTimeFormat('en-CA', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }).format(new Date())}
        </p>
      </header>

      {today.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {today.data && (
        <>
          <StepsCard data={today.data.steps} />

          <div className="grid grid-cols-1 gap-3">
            <Link
              href="/nutrition"
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent"
            >
              <Apple className="h-6 w-6 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Nutrição</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(today.data.nutrition.consumed.kcal)} kcal ·{' '}
                  {today.data.nutrition.mealsLogged} refeições
                </p>
              </div>
            </Link>

            <Link
              href="/workout"
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent"
            >
              <Dumbbell className="h-6 w-6 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Treino</p>
                <p className="text-xs text-muted-foreground">
                  {today.data.workout.completedToday
                    ? 'Concluído hoje'
                    : today.data.workout.sessionInProgress
                      ? 'Sessão em andamento'
                      : 'Sem treino'}
                </p>
              </div>
            </Link>

            <Link
              href="/progress"
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:bg-accent"
            >
              <Scale className="h-6 w-6 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Peso</p>
                <p className="text-xs text-muted-foreground">
                  {today.data.weight.latest
                    ? `${today.data.weight.latest.weightKg.toFixed(1)} kg`
                    : 'Sem registros'}
                </p>
              </div>
            </Link>
          </div>

          {(today.data.streak.nutritionDays > 0 ||
            today.data.streak.stepsDays > 0 ||
            today.data.streak.workoutWeeks > 0) && (
            <div className="rounded-lg border bg-card p-4 text-sm">
              <p className="mb-1 font-medium">Streaks</p>
              <ul className="space-y-1 text-muted-foreground">
                {today.data.streak.nutritionDays > 0 && (
                  <li>🍽️ {today.data.streak.nutritionDays} dias logando refeições</li>
                )}
                {today.data.streak.stepsDays > 0 && (
                  <li>👣 {today.data.streak.stepsDays} dias batendo meta de passos</li>
                )}
                {today.data.streak.workoutWeeks > 0 && (
                  <li>🏋️ {today.data.streak.workoutWeeks} semanas treinando</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dashboardApi } from '@/lib/api/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia 🌅';
  if (h < 18) return 'Boa tarde ☀️';
  return 'Boa noite 🌙';
}

function todayLabel() {
  return format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });
}

function CardSkeleton() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
}

export default function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => dashboardApi.today(),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">{greeting()}</h1>
        <p className="text-sm capitalize text-muted-foreground">{todayLabel()}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {/* Nutrição */}
        {isLoading ? (
          <CardSkeleton />
        ) : (
          <Link href="/nutrition">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Nutrição hoje
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-lg font-semibold tabular-nums">
                  {data ? Math.round(data.nutrition.totals.kcal) : '—'}{' '}
                  <span className="text-xs font-normal text-muted-foreground">kcal</span>
                </p>
                {data && (
                  <p className="text-xs text-muted-foreground">
                    {data.nutrition.mealsCount} refeição
                    {data.nutrition.mealsCount !== 1 ? 'ões' : ''}
                    {data.nutrition.goals?.kcalMax ? ` / ${data.nutrition.goals.kcalMax} meta` : ''}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Treino */}
        {isLoading ? (
          <CardSkeleton />
        ) : (
          <Link href={data?.workout.hasSession ? `/workout/${data.workout.sessionId}` : '/workout'}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Treino</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {data?.workout.hasSession ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-400">Sessão ativa</p>
                    <p className="text-xs text-muted-foreground">
                      {data.workout.exercisesLogged} exercício
                      {data.workout.exercisesLogged !== 1 ? 's' : ''} ·{' '}
                      {Math.round(data.workout.volumeKg)} kg
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Sem treino hoje</p>
                    <p className="text-xs text-blue-400">Iniciar sessão →</p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Peso */}
        {isLoading ? (
          <CardSkeleton />
        ) : (
          <Link href="/progress">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Peso</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {data?.weight.today != null ? (
                  <p className="text-lg font-semibold tabular-nums">
                    {data.weight.today}{' '}
                    <span className="text-xs font-normal text-muted-foreground">kg</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Não registrado</p>
                )}
                {data?.weight.lastLogDate && data.weight.today == null && (
                  <p className="text-xs text-muted-foreground">
                    Último: {format(new Date(data.weight.lastLogDate), 'dd/MM', { locale: ptBR })}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Passos */}
        {isLoading ? (
          <CardSkeleton />
        ) : (
          <Link href="/progress">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="pb-1 pt-3">
                <CardTitle className="text-xs font-medium text-muted-foreground">Passos</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <p className="text-lg font-semibold tabular-nums">
                  {data ? data.steps.today.toLocaleString('pt-BR') : '—'}
                </p>
                {data && data.steps.goal > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(data.steps.percentGoal)}% da meta (
                      {data.steps.goal.toLocaleString('pt-BR')})
                    </p>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, data.steps.percentGoal)}%` }}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}

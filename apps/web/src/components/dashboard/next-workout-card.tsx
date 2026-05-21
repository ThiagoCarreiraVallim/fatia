import Link from 'next/link';
import { Play } from 'lucide-react';
import type { TodaySummary } from '@/lib/api/progress';

interface Props {
  workout: TodaySummary['workout'];
}

export function NextWorkoutCard({ workout }: Props) {
  const { plannedToday, sessionInProgress, completedToday } = workout;

  const href = sessionInProgress ? `/workout/session/${sessionInProgress.id}` : '/workout';

  const badge = completedToday
    ? 'Treino concluído'
    : sessionInProgress
      ? 'Em andamento'
      : 'Próximo treino';

  const title = sessionInProgress
    ? 'Retomar sessão'
    : completedToday
      ? 'Ver histórico'
      : (plannedToday?.name ?? 'Treino livre');

  const subtitle = completedToday
    ? 'Parabéns!'
    : sessionInProgress
      ? `Iniciado às ${new Date(sessionInProgress.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : plannedToday
        ? 'Plano de treino'
        : 'Sem plano configurado';

  return (
    <Link href={href} className="block">
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-card">
        {/* background image area */}
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          {/* dark overlay gym texture using gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/30 via-muted to-background opacity-80" />
          <div className="absolute inset-0 flex items-end p-4">
            <span className="rounded-[4px] bg-background/80 px-2 py-1 text-[11px] font-bold tracking-wide text-foreground backdrop-blur-sm uppercase">
              {badge}
            </span>
          </div>
        </div>

        {/* content row */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-[18px] font-semibold text-foreground leading-tight">{title}</span>
            <span className="text-[14px] text-muted-foreground">{subtitle}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
            <Play size={16} fill="currentColor" />
          </div>
        </div>
      </div>
    </Link>
  );
}

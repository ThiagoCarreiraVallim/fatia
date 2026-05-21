import Link from 'next/link';
import type { DayTotals, UserGoals } from '@/lib/api/nutrition';

interface Props {
  totals: DayTotals;
  goals: UserGoals | null;
}

export function CaloriesRingCard({ totals, goals }: Props) {
  const kcalTarget = goals ? Math.round((goals.kcalMin + goals.kcalMax) / 2) : 0;
  const kcalRemaining = goals ? Math.max(0, kcalTarget - Math.round(totals.kcal)) : null;
  const pct = kcalTarget > 0 ? Math.min(1, totals.kcal / kcalTarget) : 0;

  const r = 82;
  const cx = 110;
  const cy = 110;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-card p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(143deg, rgba(44,229,0,0.12) 0%, rgba(44,229,0,0) 55%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-4">
        <div className="relative" style={{ width: 220, height: 220 }}>
          <svg
            width="220"
            height="220"
            viewBox="0 0 220 220"
            style={{ transform: 'rotate(-90deg)' }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="14"
            />
            {pct > 0 && (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#2ce500"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[44px] font-bold text-foreground tabular-nums leading-none">
              {Math.round(totals.kcal)}
            </span>
            <span className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              kcal consumidas
            </span>
          </div>
        </div>

        {goals ? (
          <div className="flex w-full items-center justify-around border-t border-white/5 pt-4">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Meta
              </span>
              <span className="text-[20px] font-bold text-foreground tabular-nums">
                {kcalTarget}
              </span>
              <span className="text-[11px] text-muted-foreground">kcal</span>
            </div>
            <div className="h-10 w-px bg-white/5" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Restante
              </span>
              <span className="text-[20px] font-bold text-foreground tabular-nums">
                {kcalRemaining}
              </span>
              <span className="text-[11px] text-muted-foreground">kcal</span>
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Defina suas{' '}
            <Link href="/nutrition/goals" className="text-primary underline">
              metas
            </Link>{' '}
            para ver a meta calórica.
          </p>
        )}
      </div>
    </div>
  );
}

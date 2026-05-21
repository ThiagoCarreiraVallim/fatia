import type { DayTotals, UserGoals } from '@/lib/api/nutrition';

function MacroCard({
  label,
  current,
  target,
  color,
  className,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className={`rounded-xl border border-white/5 bg-card p-4 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-[15px] font-bold text-foreground tabular-nums">
          {Math.round(current)}g
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {target > 0 && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          {pct}% · meta {target}g
        </div>
      )}
    </div>
  );
}

interface Props {
  totals: DayTotals;
  goals: UserGoals | null;
}

export function MacroBentoGrid({ totals, goals }: Props) {
  const protTarget = goals ? Math.round((goals.proteinMinG + goals.proteinMaxG) / 2) : 0;
  const carbTarget = goals ? Math.round((goals.carbsMinG + goals.carbsMaxG) / 2) : 0;
  const fatTarget = goals ? Math.round((goals.fatMinG + goals.fatMaxG) / 2) : 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <MacroCard
        label="Proteína"
        current={totals.proteinG}
        target={protTarget}
        color="bg-[#4b8eff]"
      />
      <MacroCard
        label="Carboidratos"
        current={totals.carbsG}
        target={carbTarget}
        color="bg-primary"
      />
      <MacroCard
        label="Gordura"
        current={totals.fatG}
        target={fatTarget}
        color="bg-[#ffb4ab]"
        className="col-span-2"
      />
    </div>
  );
}

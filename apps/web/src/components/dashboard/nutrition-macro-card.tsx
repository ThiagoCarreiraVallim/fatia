import Link from 'next/link';
import type { TodaySummary } from '@/lib/api/progress';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
}

function MacroBar({ label, current, target, color, unit = 'g' }: MacroBarProps) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px] font-bold tracking-wide">
        <span className="text-foreground uppercase">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(current)}/{target}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface Props {
  nutrition: TodaySummary['nutrition'];
}

export function NutritionMacroCard({ nutrition }: Props) {
  const { consumed, goals } = nutrition;
  const kcalTarget = goals ? Math.round((goals.kcalMin + goals.kcalMax) / 2) : 0;
  const kcalRemaining = goals ? Math.max(0, kcalTarget - Math.round(consumed.kcal)) : null;

  return (
    <Link href="/nutrition" className="block">
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-card p-5 space-y-4">
        {/* green gradient tint */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(143deg, rgba(44,229,0,0.10) 0%, rgba(44,229,0,0) 60%)',
          }}
        />

        {/* header */}
        <div className="relative flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-foreground">Resumo de Nutrição</h2>
          <span className="text-xl">🥗</span>
        </div>

        {/* body */}
        <div className="relative flex gap-4">
          {/* left: remaining kcal */}
          <div className="flex w-28 shrink-0 flex-col items-center justify-center gap-1 border-r border-white/5 pr-4">
            {kcalRemaining !== null ? (
              <>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Restam
                </span>
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {kcalRemaining}
                </span>
                <span className="text-[11px] text-muted-foreground">kcal</span>
              </>
            ) : (
              <span className="text-center text-xs text-muted-foreground leading-tight">
                Sem meta definida
              </span>
            )}
          </div>

          {/* right: macro bars */}
          <div className="flex flex-1 flex-col gap-3">
            <MacroBar
              label="KCAL"
              current={consumed.kcal}
              target={kcalTarget}
              unit=""
              color="bg-[#ffb4ab]"
            />
            <MacroBar
              label="PROT"
              current={consumed.proteinG}
              target={goals ? Math.round((goals.proteinMinG + goals.proteinMaxG) / 2) : 0}
              color="bg-[#4b8eff]"
            />
            <MacroBar
              label="CARB"
              current={consumed.carbsG}
              target={goals ? Math.round((goals.carbsMinG + goals.carbsMaxG) / 2) : 0}
              color="bg-primary"
            />
            <MacroBar
              label="GORD"
              current={consumed.fatG}
              target={goals ? Math.round((goals.fatMinG + goals.fatMaxG) / 2) : 0}
              color="bg-destructive"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

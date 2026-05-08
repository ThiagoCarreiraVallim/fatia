'use client';

interface MacroBarProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
}

/** Barra com ranges: verde dentro, amarelo borda (≤10% off), vermelho fora. */
export function MacroBar({ label, value, min, max, unit = 'g' }: MacroBarProps) {
  // const range = Math.max(max - min, 1);
  const pct = Math.min(100, (value / max) * 100);
  const status: 'in' | 'edge' | 'out' =
    value >= min && value <= max ? 'in' : value < min * 0.9 || value > max * 1.1 ? 'out' : 'edge';
  const color =
    status === 'in' ? 'bg-emerald-500' : status === 'edge' ? 'bg-amber-500' : 'bg-rose-500';
  const minMarker = (min / max) * 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {Math.round(value)}
          {unit} / {min}–{max}
          {unit}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        <div
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${minMarker}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

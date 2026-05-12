'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import type { TodaySummary } from '@/lib/api/progress';

export function StepsCard({ data }: { data: TodaySummary['steps'] }) {
  const [open, setOpen] = useState(false);
  const target = data.target;
  const pct =
    target !== null && target > 0 ? Math.min(100, Math.round((data.today / target) * 100)) : null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Passos hoje</h2>
        {data.goalReached && <span className="text-xs text-emerald-500">Meta batida</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {data.today.toLocaleString('pt-BR')}
        </span>
        {target !== null && (
          <span className="text-sm text-muted-foreground">/ {target.toLocaleString('pt-BR')}</span>
        )}
      </div>
      {pct !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
            aria-valuenow={pct}
          />
        </div>
      )}
      <Button onClick={() => setOpen(true)} variant="outline" size="sm" className="w-full">
        <Plus size={14} /> Logar passos
      </Button>
      <LogStepsDrawer open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

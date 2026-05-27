'use client';

import { useState } from 'react';
import { Droplet, MoreHorizontal } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { progressApi, type TodaySummary } from '@/lib/api/progress';
import { LogWaterDrawer } from '@/components/progress/log-water-drawer';

const QUICK_ML = [250, 500, 750] as const;

function formatVolume(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)} L`;
  return `${ml} mL`;
}

export function WaterCard({ data }: { data: TodaySummary['water'] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const qc = useQueryClient();

  const target = data.targetMl;
  const pct =
    target !== null && target > 0 ? Math.min(100, Math.round((data.todayMl / target) * 100)) : null;

  const quickAdd = useMutation({
    mutationFn: (ml: number) => progressApi.createWater({ ml }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress', 'water'] });
      qc.invalidateQueries({ queryKey: ['water-logs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-card p-5 space-y-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(143deg, rgba(75,142,255,0.10) 0%, rgba(75,142,255,0) 60%)',
        }}
      />

      <div className="relative flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[18px] font-semibold text-foreground">
          <Droplet size={18} className="text-blue-400" />
          Hidratação
        </h2>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Mais opções"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      <div className="relative">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-foreground tabular-nums">
            {formatVolume(data.todayMl)}
          </span>
          {target !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">
              / {formatVolume(target)}
            </span>
          )}
          {data.goalReached && (
            <span className="ml-auto rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">
              META BATIDA
            </span>
          )}
        </div>

        {pct !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-blue-400 transition-all"
              style={{ width: `${pct}%` }}
              aria-valuenow={pct}
            />
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-2">
        {QUICK_ML.map((ml) => (
          <button
            key={ml}
            type="button"
            disabled={quickAdd.isPending}
            onClick={() => quickAdd.mutate(ml)}
            className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
          >
            +{ml} mL
          </button>
        ))}
      </div>

      <LogWaterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

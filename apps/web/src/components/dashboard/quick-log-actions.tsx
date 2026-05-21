'use client';

import { useState } from 'react';
import { Droplets, Scale } from 'lucide-react';
import { LogStepsDrawer } from '@/components/progress/log-steps-drawer';
import { LogWeightDrawer } from '@/components/progress/log-weight-drawer';

export function QuickLogActions() {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setStepsOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-card py-4 text-[12px] font-bold tracking-wide text-foreground uppercase hover:bg-card/80 transition-colors"
        >
          <Droplets size={20} className="text-[#4b8eff]" />
          Log Água
        </button>
        <button
          type="button"
          onClick={() => setWeightOpen(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-card py-4 text-[12px] font-bold tracking-wide text-foreground uppercase hover:bg-card/80 transition-colors"
        >
          <Scale size={20} className="text-muted-foreground" />
          Log Peso
        </button>
      </div>

      <LogStepsDrawer open={stepsOpen} onClose={() => setStepsOpen(false)} />
      <LogWeightDrawer open={weightOpen} onClose={() => setWeightOpen(false)} />
    </>
  );
}

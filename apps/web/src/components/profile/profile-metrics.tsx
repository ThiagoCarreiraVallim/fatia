'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Weight, Ruler, Pencil } from 'lucide-react';
import { usersApi } from '@/lib/api/users';
import { progressApi } from '@/lib/api/progress';
import { EditHeightDrawer } from './edit-height-drawer';

export function ProfileMetrics() {
  const [heightOpen, setHeightOpen] = useState(false);

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const today = useQuery({ queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() });

  const weight = today.data?.weight.latest?.weightKg;
  const height = me.data?.heightCm;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/5 bg-card p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Weight size={12} />
            Peso Atual
          </div>
          <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">
            {weight !== undefined && weight !== null ? `${weight.toFixed(1)} kg` : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHeightOpen(true)}
          className="rounded-2xl border border-white/5 bg-card p-4 text-left transition-colors hover:border-white/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <Ruler size={12} />
              Estatura
            </div>
            <Pencil size={11} className="text-muted-foreground" />
          </div>
          <p className="mt-1 text-xl font-extrabold text-foreground tabular-nums">
            {height ? `${Math.round(height)} cm` : '—'}
          </p>
        </button>
      </div>

      <EditHeightDrawer
        open={heightOpen}
        onClose={() => setHeightOpen(false)}
        currentHeightCm={height ?? null}
      />
    </>
  );
}

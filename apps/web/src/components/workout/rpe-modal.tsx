'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { workoutApi, type SessionSet } from '@/lib/api/workout';
import { getRpeInfo } from '@/lib/workout/rpe';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  set: SessionSet | null;
  onConfirmed?: () => void;
}

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

export function RpeModal({ open, onOpenChange, sessionId, set, onConfirmed }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  const save = useMutation({
    mutationFn: (rpe: number) => {
      if (!set) throw new Error('Sem série selecionada');
      return workoutApi.updateSet(sessionId, set.id, { rpe });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      setSelected(null);
      onConfirmed?.();
      onOpenChange(false);
    },
  });

  function handleSkip() {
    setSelected(null);
    onConfirmed?.();
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(null);
        onOpenChange(v);
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Como foi a série?</DrawerTitle>
          <DrawerDescription>
            Avalie o esforço percebido (RPE) — isso ajuda a calibrar próximos treinos.
          </DrawerDescription>
        </DrawerHeader>

        <div className="mt-2 grid grid-cols-5 gap-2">
          {RPE_VALUES.map((value) => {
            const info = getRpeInfo(value);
            if (!info) return null;
            const active = selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSelected(value)}
                className={`flex flex-col items-center gap-1 rounded-2xl border p-3 transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-white/5 bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-3xl leading-none">{info.emoji}</span>
                <span className="text-sm font-extrabold tabular-nums text-foreground">{value}</span>
              </button>
            );
          })}
        </div>

        {selected != null && (
          <div className="mt-3 rounded-xl bg-muted/40 px-4 py-3 text-center">
            <p className="text-sm font-bold text-foreground">{getRpeInfo(selected)?.label}</p>
            <p className="text-xs text-muted-foreground">{getRpeInfo(selected)?.hint}</p>
          </div>
        )}

        {save.error && (
          <p className="mt-2 text-sm text-rose-500">
            Erro: {save.error instanceof Error ? save.error.message : 'Tente novamente.'}
          </p>
        )}

        <div className="mt-4 space-y-2">
          <Button
            className="h-11 w-full rounded-full font-extrabold"
            disabled={selected == null || save.isPending}
            onClick={() => selected != null && save.mutate(selected)}
          >
            {save.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={handleSkip}>
            Pular
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

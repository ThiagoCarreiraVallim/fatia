'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WorkoutSession;
}

function formatDuration(start: string, end?: string): string {
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function FinishSessionModal({ open, onOpenChange, session }: Props) {
  const qc = useQueryClient();
  const router = useRouter();
  const [notes, setNotes] = useState(session.notes ?? '');

  const totalSets = session.sets?.length ?? 0;
  const totalVolume =
    session.sets?.reduce((acc, s) => {
      if (s.weightKg != null && s.reps != null) return acc + s.weightKg * s.reps;
      return acc;
    }, 0) ?? 0;

  const finish = useMutation({
    mutationFn: () => workoutApi.finishSession(session.id, { notes: notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      onOpenChange(false);
      router.push('/workout');
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Finalizar treino</DrawerTitle>
          <DrawerDescription>Confirme e salve sua sessão.</DrawerDescription>
        </DrawerHeader>

        <div className="my-3 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold tabular-nums">{totalSets}</p>
              <p className="text-xs text-muted-foreground">séries</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold tabular-nums">
                {totalVolume > 0 ? `${Math.round(totalVolume)}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">vol. kg</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{formatDuration(session.startedAt)}</p>
              <p className="text-xs text-muted-foreground">duração</p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="session-notes" className="text-sm font-medium">
              Observações (opcional)
            </label>
            <textarea
              id="session-notes"
              className="w-full rounded-md border px-3 py-2 text-sm resize-none"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Como foi o treino?"
            />
          </div>

          {finish.error && (
            <p className="text-sm text-rose-500">Erro ao finalizar treino. Tente novamente.</p>
          )}

          <Button className="w-full" onClick={() => finish.mutate()} disabled={finish.isPending}>
            {finish.isPending ? 'Salvando...' : 'Finalizar'}
          </Button>
        </div>

        <DrawerClose asChild>
          <Button variant="ghost" className="w-full">
            Continuar treinando
          </Button>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}

'use client';

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
import { workoutApi, type WorkoutSession } from '@fatia/api-client';
import { elapsedLabel, formatInteger, totalVolumeKg } from './format';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WorkoutSession;
}

export function FinishSessionModal({ open, onOpenChange, session }: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  const totalSets = session.sets?.length ?? 0;
  const totalVolume = totalVolumeKg(session.sets);

  const finish = useMutation({
    mutationFn: async () => {
      try {
        // A sensação e a observação vêm depois, no "Treino feito!" (#377).
        await workoutApi.finishSession(session.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!/not found/i.test(msg)) throw err;
      }
    },
    onSuccess: () => {
      qc.setQueryData(['workout', 'active'], null);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      // Como no app: a sessão concluída e o painel (treino do dia, sequência)
      // mudam com o fim do treino, e ficavam velhos até o próximo refetch.
      qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
      router.push(`/workout/session/${session.id}`);
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Finalizar treino</DrawerTitle>
          <DrawerDescription>Depois você conta como foi.</DrawerDescription>
        </DrawerHeader>

        <div className="my-3 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold tabular-nums">{totalSets}</p>
              <p className="text-xs text-muted-foreground">séries</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold tabular-nums">
                {totalVolume > 0 ? formatInteger(totalVolume) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">vol. kg</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{elapsedLabel(session.startedAt)}</p>
              <p className="text-xs text-muted-foreground">duração</p>
            </div>
          </div>

          {finish.error && (
            <p className="text-sm text-danger">
              Erro ao finalizar treino:{' '}
              {finish.error instanceof Error ? finish.error.message : 'Tente novamente.'}
            </p>
          )}

          <Button
            className="h-12 w-full rounded-full font-extrabold"
            onClick={() => finish.mutate()}
            disabled={finish.isPending}
          >
            {finish.isPending ? 'Finalizando…' : 'Finalizar treino'}
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

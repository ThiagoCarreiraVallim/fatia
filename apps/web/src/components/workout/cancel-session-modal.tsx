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
import { workoutApi, type WorkoutSession } from '@/lib/api/workout';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WorkoutSession;
}

export function CancelSessionModal({ open, onOpenChange, session }: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  const cancel = useMutation({
    mutationFn: () => workoutApi.deleteSession(session.id),
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
          <DrawerTitle>Cancelar treino</DrawerTitle>
          <DrawerDescription>
            Isso irá apagar a sessão e todos os exercícios registrados. Essa ação não pode ser
            desfeita.
          </DrawerDescription>
        </DrawerHeader>

        <div className="mt-4 space-y-2">
          {cancel.error && (
            <p className="text-sm text-rose-500">Erro ao cancelar treino. Tente novamente.</p>
          )}

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
          >
            {cancel.isPending ? 'Cancelando...' : 'Sim, cancelar treino'}
          </Button>

          <DrawerClose asChild>
            <Button variant="ghost" className="w-full">
              Continuar treinando
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

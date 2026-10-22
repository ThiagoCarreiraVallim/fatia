'use client';

import type { ExerciseGroup } from '@fatia/api-client';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface Props {
  /** O exercício a confirmar; `null` fecha. */
  group: ExerciseGroup | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (group: ExerciseGroup) => void;
}

/**
 * Confirma tirar da sessão um exercício que já tem série registrada — sem série
 * não há o que perder, e a página tira direto. Diz quantas séries vão embora e
 * que o plano não muda, que é a dúvida de quem toca na lixeira no meio do treino.
 */
export function RemoveExerciseModal({ group, onOpenChange, onConfirm }: Props) {
  const count = group?.sets.length ?? 0;

  return (
    <Drawer open={group != null} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Tirar {group?.exerciseName ?? 'exercício'} do treino?</DrawerTitle>
          <DrawerDescription>
            {count === 1
              ? 'A série registrada será apagada'
              : `As ${count} séries registradas serão apagadas`}
            . O plano não muda: ele volta no próximo treino.
          </DrawerDescription>
        </DrawerHeader>

        <div className="mt-4 space-y-2">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => group && onConfirm(group)}
          >
            Tirar do treino
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

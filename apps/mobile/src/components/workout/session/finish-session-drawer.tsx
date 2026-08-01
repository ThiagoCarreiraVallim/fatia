import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { workoutApi, type WorkoutSession } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
  Label,
} from '@/components/ui';
import { formatInteger } from '@/components/charts';
import { elapsedLabel, totalVolumeKg } from './format';

/**
 * `apps/web/src/components/workout/finish-session-modal.tsx`.
 *
 * Continua drawer, e não `Alert`: tem campo de observações, e `Alert` com
 * entrada de texto só existe no iOS. As observações são digitadas com
 * `DrawerTextInput` — um `TextInput` comum não avisa o sheet que o teclado
 * subiu e o campo some atrás dele (ver `ui/drawer.tsx`).
 */
export function FinishSessionDrawer({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: WorkoutSession;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [notes, setNotes] = useState(session.notes ?? '');

  const totalSets = session.sets?.length ?? 0;
  const volume = totalVolumeKg(session.sets);

  const finish = useMutation({
    mutationFn: async () => {
      try {
        await workoutApi.finishSession(session.id, { notes: notes.trim() || undefined });
      } catch (err) {
        // Sessão já finalizada em outro aparelho não é erro para quem está aqui.
        const message = err instanceof Error ? err.message : '';
        if (!/not found/i.test(message)) throw err;
      }
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.setQueryData(['workout', 'active'], null);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'sessions'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', session.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpenChange(false);
      router.replace('/workout');
    },
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Finalizar treino</DrawerTitle>
          <DrawerDescription>Confirme e salve sua sessão.</DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 py-3">
          <View className="flex-row gap-2">
            <Stat value={String(totalSets)} label="séries" />
            <Stat value={volume > 0 ? formatInteger(volume) : '—'} label="vol. kg" />
            <Stat value={elapsedLabel(session.startedAt)} label="duração" />
          </View>

          <View className="gap-1.5">
            <Label>Observações (opcional)</Label>
            <DrawerTextInput
              value={notes}
              onChangeText={setNotes}
              accessibilityLabel="Observações do treino"
              placeholder="Como foi o treino?"
              placeholderTextColor="#8a8a8a"
              selectionColor="#2ce500"
              multiline
              numberOfLines={3}
              style={{
                minHeight: 88,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#333333',
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 16,
                color: '#e5e2e1',
                textAlignVertical: 'top',
              }}
            />
          </View>

          {finish.error ? <FormMessage>{(finish.error as Error).message}</FormMessage> : null}
        </View>

        <DrawerFooter className="px-0">
          <Button loading={finish.isPending} onPress={() => finish.mutate()}>
            Finalizar
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Continuar treinando
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center rounded-lg border border-border p-3">
      <Text className="text-2xl font-bold text-foreground">{value}</Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
}

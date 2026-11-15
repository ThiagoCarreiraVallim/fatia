import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  feelingToRpe,
  loadFieldValue,
  loadToKg,
  loadUnitLabel,
  rpeToFeeling,
  workoutApi,
  type SessionSet,
} from '@fatia/api-client';
import { Button, useConfirm } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { FeelingPicker } from './feeling-picker';
import { STEPS } from './guided-session';
import { ValueStepper } from './value-stepper';

/**
 * "Corrigir série N" (prancha `Al-T3-Sessao`): abre no lugar ao tocar num chip
 * de série feita. Carga e reps (no cardio, km e minutos) digitáveis ou no −/+,
 * a sensação, e Excluir (com confirmação) ou Salvar.
 */
export function SetEditor({
  set,
  index,
  isCardio,
  sessionId,
  onClose,
}: {
  set: SessionSet;
  index: number;
  isCardio: boolean;
  sessionId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const units = useUnitPrefs();
  const unitLabel = loadUnitLabel(units.loadUnit);

  const [load, setLoad] = useState(() =>
    isCardio ? (set.distanceMeters ?? 0) / 1000 : loadFieldValue(set.weightKg ?? 0, units.loadUnit),
  );
  const [count, setCount] = useState(() =>
    isCardio ? Math.round((set.durationSeconds ?? 0) / 60) : (set.reps ?? 0),
  );
  const [feeling, setFeeling] = useState<number | null>(() => rpeToFeeling(set.rpe));

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
  }

  const save = useMutation({
    mutationFn: () =>
      workoutApi.updateSet(
        sessionId,
        set.id,
        isCardio
          ? {
              distanceMeters: load > 0 ? Math.round(load * 1000) : undefined,
              durationSeconds: count > 0 ? count * 60 : undefined,
            }
          : {
              weightKg: loadToKg(load, units.loadUnit),
              reps: count,
              rpe: feeling != null ? feelingToRpe(feeling) : undefined,
            },
      ),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => workoutApi.deleteSet(sessionId, set.id),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      invalidate();
      onClose();
    },
  });

  const busy = save.isPending || remove.isPending;

  return (
    <View className="gap-3 rounded-3xl border border-border bg-muted/40 p-3">
      <Text accessibilityRole="header" className="font-sans-bold text-sm text-foreground">
        Corrigir série {index + 1}
      </Text>
      <View className="flex-row gap-2">
        <ValueStepper
          size="sm"
          label={isCardio ? 'Distância' : 'Carga'}
          unit={isCardio ? 'km' : unitLabel}
          accessibilityLabel={isCardio ? 'distância em km' : `carga em ${unitLabel}`}
          value={load}
          step={isCardio ? STEPS.distance : STEPS.load}
          onChange={setLoad}
        />
        <ValueStepper
          size="sm"
          label={isCardio ? 'Tempo' : 'Repetições'}
          unit={isCardio ? 'min' : undefined}
          accessibilityLabel={isCardio ? 'minutos' : 'repetições'}
          value={count}
          step={isCardio ? STEPS.minutes : STEPS.reps}
          integer
          onChange={setCount}
        />
      </View>
      {isCardio ? null : <FeelingPicker compact value={feeling} onChange={setFeeling} />}
      {save.error || remove.error ? (
        <Text className="text-xs text-danger">Não deu para salvar. Tente de novo.</Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1 rounded-full"
          disabled={busy}
          loading={remove.isPending}
          onPress={() =>
            confirm({
              title: `Excluir série ${index + 1}?`,
              description: 'A série sai do treino e do volume da sessão.',
              confirmLabel: 'Excluir',
              cancelLabel: 'Manter',
              destructive: true,
              onConfirm: () => remove.mutate(),
            })
          }
        >
          Excluir
        </Button>
        <Button
          className="h-11 flex-1 rounded-full"
          disabled={busy}
          loading={save.isPending}
          onPress={() => save.mutate()}
        >
          Salvar
        </Button>
      </View>
    </View>
  );
}

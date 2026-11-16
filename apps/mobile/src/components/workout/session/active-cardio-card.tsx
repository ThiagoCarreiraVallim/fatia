import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { newSetClientKey, workoutApi, type ExerciseGroup } from '@fatia/api-client';
import { Button } from '@/components/ui';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { formatPace, formatPreviousSet } from './format';
import { STEPS } from './guided-session';
import { useDockedAction } from './session-dock';
import { SetChips } from './set-chips';
import { SetEditor } from './set-editor';
import { ValueStepper } from './value-stepper';
import { colors } from '@/theme/colors';

/**
 * O cardio da sessão guiada (prancha `Al-T3-Sessao`, a esteira do fim): tempo,
 * distância, FC média e calorias, todos digitáveis ou no −/+, e o ritmo
 * calculado. Grava uma série só — o `log_set` da API é discriminado por tipo —
 * e, se ela já existe, "Concluir" a atualiza em vez de criar outra.
 *
 * O cronômetro que o card tinha saiu: o canvas pede o tempo como número, e
 * quem corre na esteira lê o tempo no painel dela.
 */
export function ActiveCardioCard({
  sessionId,
  group,
  working,
  onLogged,
  nav,
  onAll,
  beforeSubmit,
}: {
  sessionId: string;
  group: ExerciseGroup;
  working: boolean;
  onLogged: (completed: boolean) => void;
  /** "1/7" e as setas do exercício, à direita da linha da série (prancha `Al-T3d`). */
  nav?: ReactNode;
  /** "Todas ›", ao lado dos chips das séries. */
  onAll?: () => void;
  /** O "Passar sozinho", que a prancha põe logo acima do "Concluir série". */
  beforeSubmit?: ReactNode;
}) {
  const qc = useQueryClient();
  const units = useUnitPrefs();
  const existing = group.sets[0];
  const [editing, setEditing] = useState<number | null>(null);

  const [km, setKm] = useState(() =>
    existing?.distanceMeters != null ? existing.distanceMeters / 1000 : 0,
  );
  const [minutes, setMinutes] = useState(() =>
    existing?.durationSeconds != null ? Math.round(existing.durationSeconds / 60) : 0,
  );
  const [bpm, setBpm] = useState(() => existing?.avgHeartRate ?? 0);
  const [kcal, setKcal] = useState(() => existing?.kcalBurned ?? 0);

  // Sem `before`: aqui a referência é só rótulo. Descarta a desta sessão.
  const previous = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId],
    queryFn: () => workoutApi.getLastSet(group.exerciseId),
    staleTime: Infinity,
  });
  const lastTime = formatPreviousSet(
    previous.data && previous.data.sessionId !== sessionId ? previous.data : null,
    true,
    units,
  );

  const meters = km > 0 ? Math.round(km * 1000) : null;
  const pace = meters != null && minutes > 0 ? formatPace(minutes * 60, meters) : null;

  const clientKey = useRef<string | null>(null);
  const save = useMutation({
    mutationFn: (key: string) => {
      const body = {
        durationSeconds: minutes > 0 ? minutes * 60 : undefined,
        distanceMeters: meters ?? undefined,
        avgHeartRate: bpm > 0 ? bpm : undefined,
        kcalBurned: kcal > 0 ? kcal : undefined,
      };
      if (existing) return workoutApi.updateSet(sessionId, existing.id, body);
      return workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        ...body,
        clientKey: key,
      });
    },
    onSuccess: () => {
      clientKey.current = null;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(`${group.exerciseName} salvo.`);
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      onLogged(true);
    },
  });

  const nothing = minutes === 0 && meters == null && bpm === 0 && kcal === 0;
  const editingSet = editing != null ? group.sets[editing] : undefined;

  // Preso no rodapé da sessão, como o da força (`useDockedAction`).
  const submitInline = useDockedAction(
    working && !existing ? (
      <Button
        className="h-[60px] rounded-full"
        disabled={save.isPending || nothing}
        loading={save.isPending}
        onPress={() => {
          if (save.isPending) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          clientKey.current ??= newSetClientKey();
          save.mutate(clientKey.current);
        }}
      >
        <Check size={18} color={colors.primaryForeground} />
        <Text className="font-sans-bold text-base text-primary-foreground">Concluir série 1</Text>
      </Button>
    ) : null,
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] text-muted-foreground">
          {/* Como no PWA: a referência da última vez, sem o "Série 1 de 1". */}
          {lastTime ? `Anterior: ${lastTime}` : 'Cardio'}
        </Text>
        {nav}
      </View>

      <SetChips
        group={group}
        editing={editingSet ? editing : null}
        onEdit={setEditing}
        onAll={onAll}
      />

      {editingSet && editing != null ? (
        <SetEditor
          key={editingSet.id}
          set={editingSet}
          index={editing}
          isCardio
          sessionId={sessionId}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {working && !existing ? (
        <>
          <View className="flex-row gap-2">
            <ValueStepper
              label="Distância"
              unit="km"
              stacked={{ shortLabel: 'km' }}
              accessibilityLabel={`distância em km de ${group.exerciseName}`}
              value={km}
              step={STEPS.distance}
              onChange={setKm}
            />
            <ValueStepper
              label="Tempo"
              unit="min"
              stacked={{ shortLabel: 'min' }}
              accessibilityLabel={`minutos de ${group.exerciseName}`}
              value={minutes}
              step={STEPS.minutes}
              integer
              onChange={setMinutes}
            />
          </View>
          <View className="flex-row gap-2">
            <ValueStepper
              size="sm"
              label="FC média"
              unit="bpm"
              accessibilityLabel="frequência cardíaca média"
              value={bpm}
              step={1}
              integer
              onChange={setBpm}
            />
            <ValueStepper
              size="sm"
              label="Calorias"
              unit="kcal"
              accessibilityLabel="calorias gastas"
              value={kcal}
              step={10}
              integer
              onChange={setKcal}
            />
          </View>
          <Text className="text-center text-[13px] text-muted-foreground">Ritmo {pace ?? '—'}</Text>

          {save.error ? (
            <Text className="text-xs text-danger">Não deu para salvar. Toque de novo.</Text>
          ) : null}

          {beforeSubmit}

          {submitInline}
        </>
      ) : null}
    </View>
  );
}

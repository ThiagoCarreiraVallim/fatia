import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Info, Pause, Play, RotateCcw } from 'lucide-react-native';
import { workoutApi, type ExerciseGroup } from '@fatia/api-client';
import { Button, Input } from '@/components/ui';
import { useOpenExerciseDetail } from '@/components/workout/exercise-detail-host';
import {
  formatClock,
  formatPace,
  formatPreviousSet,
  parseClock,
  parseDecimalInput,
  parseIntegerInput,
} from './format';

/**
 * Réplica de `apps/web/src/components/workout/active-cardio-card.tsx`.
 *
 * Cardio grava uma série só, com campos próprios (duração, distância, FC, kcal)
 * — o `log_set` da API é discriminado por tipo, e nenhum deles existe no card de
 * força. Por isso "Salvar" atualiza a série existente em vez de criar outra.
 *
 * O cronômetro conta a partir do instante em que começou, e não somando um
 * segundo por tique: em segundo plano o `setInterval` do JS é estrangulado e uma
 * corrida de 30 minutos terminaria marcando bem menos.
 */

export function ActiveCardioCard({
  sessionId,
  group,
  onFinishExercise,
}: {
  sessionId: string;
  group: ExerciseGroup;
  onFinishExercise: () => void;
}) {
  const qc = useQueryClient();
  const openDetail = useOpenExerciseDetail();
  const existing = group.sets[0];

  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(existing?.durationSeconds ?? 0);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState('');

  const [distanceKm, setDistanceKm] = useState(
    existing?.distanceMeters != null
      ? (existing.distanceMeters / 1000).toFixed(2).replace('.', ',')
      : '',
  );
  const [bpm, setBpm] = useState(
    existing?.avgHeartRate != null ? String(existing.avgHeartRate) : '',
  );
  const [kcal, setKcal] = useState(existing?.kcalBurned != null ? String(existing.kcalBurned) : '');

  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    const base = secondsRef.current;
    const id = setInterval(() => {
      setSeconds(base + Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [running]);

  // Ver `active-exercise-card.tsx`: `getLastSet` inclui a série desta sessão, e
  // o cliente compartilhado não expõe o `before` do endpoint.
  const previous = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId],
    queryFn: () => workoutApi.getLastSet(group.exerciseId),
    staleTime: Infinity,
  });
  const previousLabel = formatPreviousSet(
    previous.data && previous.data.sessionId !== sessionId ? previous.data : null,
    true,
  );

  const distanceMeters = (() => {
    const parsed = parseDecimalInput(distanceKm);
    if (parsed == null || parsed <= 0) return null;
    return Math.round(parsed * 1000);
  })();

  const pace = distanceMeters != null ? formatPace(seconds, distanceMeters) : null;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        durationSeconds: seconds || undefined,
        distanceMeters: distanceMeters ?? undefined,
        avgHeartRate: parseIntegerInput(bpm) ?? undefined,
        kcalBurned: parseIntegerInput(kcal) ?? undefined,
      };
      if (existing) return workoutApi.updateSet(sessionId, existing.id, body);
      return workoutApi.logSet(sessionId, { exerciseId: group.exerciseId, ...body });
    },
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AccessibilityInfo.announceForAccessibility(`${group.exerciseName} salvo.`);
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      setRunning(false);
    },
  });

  function commitDuration() {
    const parsed = parseClock(durationDraft);
    if (parsed != null) setSeconds(parsed);
    setEditingDuration(false);
  }

  function reset() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRunning(false);
    setSeconds(0);
  }

  const nothingToSave = !seconds && distanceMeters == null && !bpm.trim() && !kcal.trim();

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <View className="items-center">
        <Text className="text-[10px] font-extrabold tracking-wide text-primary">CARDIO</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver detalhes de ${group.exerciseName}`}
          onPress={() => openDetail(group.exerciseId)}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 px-2 active:opacity-80"
        >
          <Text className="text-base font-extrabold text-foreground">{group.exerciseName}</Text>
          <Info size={14} color="#baccaf" />
        </Pressable>
        {previousLabel ? (
          <Text className="text-[11px] text-muted-foreground">Anterior: {previousLabel}</Text>
        ) : null}
      </View>

      <View className="mt-3 rounded-2xl bg-muted p-4">
        <Text className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
          DURAÇÃO
        </Text>

        {editingDuration ? (
          <Input
            autoFocus
            value={durationDraft}
            onChangeText={setDurationDraft}
            onBlur={commitDuration}
            onSubmitEditing={commitDuration}
            returnKeyType="done"
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Duração do cardio"
            accessibilityHint="Formato minutos e segundos, por exemplo 12:30"
            placeholder="m:ss"
            className="mt-1 border-0 bg-transparent text-center text-4xl font-extrabold"
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Duração ${formatClock(seconds)}. Tocar para digitar`}
            accessibilityLiveRegion={running ? 'polite' : 'none'}
            onPress={() => {
              setRunning(false);
              setDurationDraft(formatClock(seconds));
              setEditingDuration(true);
            }}
            className="min-h-[56px] justify-center"
          >
            <Text className="text-center text-5xl font-extrabold text-foreground">
              {formatClock(seconds)}
            </Text>
          </Pressable>
        )}

        <View className="mt-3 flex-row items-center justify-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? 'Pausar cronômetro' : 'Iniciar cronômetro'}
            accessibilityState={{ disabled: editingDuration }}
            disabled={editingDuration}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setRunning((value) => !value);
            }}
            style={editingDuration ? { opacity: 0.5 } : undefined}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-80"
          >
            {running ? (
              <Pause size={20} color="#131313" fill="#131313" />
            ) : (
              <Play size={20} color="#131313" fill="#131313" />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zerar cronômetro"
            onPress={reset}
            className="h-11 w-11 items-center justify-center rounded-full bg-background active:opacity-80"
          >
            <RotateCcw size={16} color="#baccaf" />
          </Pressable>
        </View>
      </View>

      <View className="mt-3 flex-row gap-2">
        <MetricField
          label="DISTÂNCIA (KM)"
          accessibilityLabel={`Distância em quilômetros de ${group.exerciseName}`}
          value={distanceKm}
          onChangeText={setDistanceKm}
          placeholder="0,00"
          keyboardType="decimal-pad"
        />
        <MetricField
          label="FC (BPM)"
          accessibilityLabel={`Frequência cardíaca média de ${group.exerciseName}`}
          value={bpm}
          onChangeText={(value) => setBpm(value.replace(/\D/g, ''))}
          placeholder="—"
          keyboardType="numeric"
        />
        <MetricField
          label="KCAL"
          accessibilityLabel={`Calorias gastas em ${group.exerciseName}`}
          value={kcal}
          onChangeText={(value) => setKcal(value.replace(/\D/g, ''))}
          placeholder="—"
          keyboardType="numeric"
        />
      </View>

      {pace ? (
        <Text className="mt-2 text-center text-[11px] font-bold text-primary">
          Pace estimado: {pace}
        </Text>
      ) : null}

      <View className="mt-4 gap-2">
        <Button
          className="h-12 rounded-full"
          disabled={nothingToSave}
          loading={save.isPending}
          onPress={() => save.mutate()}
        >
          <Check size={16} color="#131313" />
          <Text className="text-sm font-extrabold text-primary-foreground">
            {existing ? 'Atualizar sessão' : 'Salvar sessão'}
          </Text>
        </Button>
        <Button variant="outline" className="h-12 rounded-full" onPress={onFinishExercise}>
          Finalizar exercício
        </Button>
      </View>
    </View>
  );
}

function MetricField({
  label,
  accessibilityLabel,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType: 'decimal-pad' | 'numeric';
}) {
  return (
    <View className="flex-1 rounded-xl bg-muted px-2 py-2">
      <Text className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </Text>
      <Input
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        keyboardType={keyboardType}
        returnKeyType="done"
        className="border-0 bg-transparent px-0 text-center text-xl font-extrabold"
      />
    </View>
  );
}

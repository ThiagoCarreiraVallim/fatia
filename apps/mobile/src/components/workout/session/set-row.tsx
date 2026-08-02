import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Trash2 } from 'lucide-react-native';
import { getRpeInfo, workoutApi, type SessionSet } from '@fatia/api-client';
import { Input } from '@/components/ui';
import { formatClock, formatNumber, parseClock, parseDecimalInput } from './format';
import { RpeBadge } from './rpe-badge';

/**
 * Réplica de `apps/web/src/components/workout/set-row.tsx`.
 *
 * As colunas mudam com o tipo do exercício porque o `log_set` da API é um schema
 * discriminado: força aceita carga, reps e RPE; cardio aceita duração,
 * distância, FC e kcal. Um formulário único mostraria "carga" numa corrida.
 *
 * A largura das células copia a do `ExerciseDetailCard` (`w-10` + três `flex-1`
 * + `w-10`) de propósito: esta linha é injetada lá por `renderSet`, e qualquer
 * outra medida desalinharia o cabeçalho da tabela dele.
 *
 * Duas diferenças em relação ao web:
 *
 * - RPE não é campo de texto e sim um botão que abre o drawer de RPE. Digitar
 *   "8,5" com uma mão entre séries é pior do que tocar num rosto; o drawer é o
 *   mesmo que aparece ao concluir a série, então o vocabulário não muda.
 * - excluir pede confirmação. No web o clique é preciso e desfazer é recarregar
 *   a página; aqui o alvo tem 44pt ao lado do polegar que acabou de digitar.
 */

export interface SetRowProps {
  set: SessionSet;
  index: number;
  isCardio: boolean;
  /** Sem `sessionId` a linha é só leitura — mesma regra do PWA. */
  sessionId?: string;
  showDelete: boolean;
  onEditRpe?: (set: SessionSet) => void;
}

export function SetRow({ set, index, isCardio, sessionId, showDelete, onEditRpe }: SetRowProps) {
  const editable = Boolean(sessionId);
  const qc = useQueryClient();

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    if (sessionId) qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
  }

  const update = useMutation({
    mutationFn: (body: Parameters<typeof workoutApi.updateSet>[2]) => {
      if (!sessionId) throw new Error('sessionId obrigatório');
      return workoutApi.updateSet(sessionId, set.id, body);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error('sessionId obrigatório');
      return workoutApi.deleteSet(sessionId, set.id);
    },
    onSuccess: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      invalidate();
    },
  });

  function confirmRemove() {
    Alert.alert(`Excluir série ${index + 1}?`, 'A série sai do treino e do volume da sessão.', [
      { text: 'Manter', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  const label = `Série ${index + 1}`;

  return (
    <View className="flex-row items-center gap-2 rounded-lg bg-muted px-1 py-1">
      <View className="w-10 items-center">
        <Text className="text-xs font-bold text-muted-foreground">{index + 1}</Text>
      </View>

      {isCardio ? (
        <>
          <ClockCell
            seconds={set.durationSeconds}
            editable={editable}
            label={`Duração da ${label}`}
            onChange={(durationSeconds) => update.mutate({ durationSeconds })}
          />
          <NumberCell
            value={set.distanceMeters}
            editable={editable}
            label={`Distância da ${label} em metros`}
            placeholder="m"
            onChange={(distanceMeters) => update.mutate({ distanceMeters })}
          />
          <NumberCell
            value={set.avgHeartRate}
            editable={editable}
            label={`Frequência cardíaca média da ${label}`}
            integer
            onChange={(avgHeartRate) => update.mutate({ avgHeartRate })}
          />
        </>
      ) : (
        <>
          <NumberCell
            value={set.reps}
            editable={editable}
            label={`Repetições da ${label}`}
            integer
            onChange={(reps) => update.mutate({ reps })}
          />
          <NumberCell
            value={set.weightKg}
            editable={editable}
            label={`Carga da ${label} em quilos`}
            onChange={(weightKg) => update.mutate({ weightKg })}
          />
          <RpeCell
            value={set.rpe}
            editable={editable && Boolean(onEditRpe)}
            label={`RPE da ${label}`}
            onPress={() => onEditRpe?.(set)}
          />
        </>
      )}

      {showDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Excluir ${label}`}
          accessibilityState={{ disabled: remove.isPending }}
          disabled={remove.isPending}
          onPress={confirmRemove}
          style={remove.isPending ? { opacity: 0.5 } : undefined}
          className="h-11 w-10 items-center justify-center rounded-full active:bg-accent"
        >
          <Trash2 size={16} color="#baccaf" />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Rascunho local de uma célula, reespelhado quando a prop comprometida muda.
 *
 * As duas células abaixo faziam isto com `useEffect(() => setDraft(...), [value])`,
 * o que pinta um quadro com o valor velho antes de corrigir e é o que o
 * `react-hooks/set-state-in-effect` acusa (#187). O ajuste durante o render faz o
 * React reprocessar o componente antes de pintar, e a comparação é exatamente a
 * mesma que estava no array de dependências — mesmos momentos de reset, um quadro
 * a menos. Não há passagem de montagem porque o `useState` já inicializa com
 * `format(value)`: no efeito, a rodada de montagem era um no-op.
 *
 * `format` precisa ser pura — roda no render.
 */
function useMirroredDraft<T>(value: T, format: (value: T) => string) {
  const [draft, setDraft] = useState(() => format(value));
  const [previous, setPrevious] = useState(value);
  if (!Object.is(value, previous)) {
    setPrevious(value);
    setDraft(format(value));
  }
  return [draft, setDraft] as const;
}

const asNumberText = (value: number | null): string => (value != null ? formatNumber(value) : '');
const asClockText = (seconds: number | null): string =>
  seconds != null ? formatClock(seconds) : '';

function NumberCell({
  value,
  editable,
  label,
  placeholder = '—',
  integer,
  onChange,
}: {
  value: number | null;
  editable: boolean;
  label: string;
  placeholder?: string;
  integer?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useMirroredDraft(value, asNumberText);

  if (!editable) {
    return (
      <View className="flex-1">
        <Text className="text-sm text-foreground">{formatNumber(value)}</Text>
      </View>
    );
  }

  function commit() {
    if (draft.trim() === '') {
      if (value != null) onChange(undefined);
      return;
    }
    const parsed = parseDecimalInput(draft);
    if (parsed == null || parsed < 0) {
      setDraft(value != null ? formatNumber(value) : '');
      return;
    }
    const next = integer ? Math.round(parsed) : parsed;
    if (next !== value) onChange(next);
    setDraft(formatNumber(next));
  }

  return (
    <View className="flex-1">
      <Input
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        keyboardType={integer ? 'numeric' : 'decimal-pad'}
        accessibilityLabel={label}
        placeholder={placeholder}
        className="min-h-[44px] border-0 bg-transparent px-1 text-center text-sm font-bold"
      />
    </View>
  );
}

function ClockCell({
  seconds,
  editable,
  label,
  onChange,
}: {
  seconds: number | null;
  editable: boolean;
  label: string;
  onChange: (seconds: number | undefined) => void;
}) {
  const [draft, setDraft] = useMirroredDraft(seconds, asClockText);

  if (!editable) {
    return (
      <View className="flex-1">
        <Text className="text-sm text-foreground">
          {seconds != null ? formatClock(seconds) : '—'}
        </Text>
      </View>
    );
  }

  function commit() {
    if (draft.trim() === '') {
      if (seconds != null) onChange(undefined);
      return;
    }
    const parsed = parseClock(draft);
    if (parsed == null) {
      setDraft(seconds != null ? formatClock(seconds) : '');
      return;
    }
    if (parsed !== seconds) onChange(parsed);
    setDraft(formatClock(parsed));
  }

  return (
    <View className="flex-1">
      <Input
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={label}
        accessibilityHint="Formato minutos e segundos, por exemplo 12:30"
        placeholder="m:ss"
        className="min-h-[44px] border-0 bg-transparent px-1 text-center text-sm font-bold"
      />
    </View>
  );
}

function RpeCell({
  value,
  editable,
  label,
  onPress,
}: {
  value: number | null;
  editable: boolean;
  label: string;
  onPress: () => void;
}) {
  const info = getRpeInfo(value);
  const content = <RpeBadge value={value} className="justify-center" />;

  if (!editable) {
    return <View className="flex-1">{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        info
          ? `${label}: ${formatNumber(value)}, ${info.label}. Tocar para alterar`
          : `Definir ${label}`
      }
      onPress={onPress}
      className="min-h-[44px] flex-1 justify-center rounded-md active:bg-accent"
    >
      {content}
    </Pressable>
  );
}

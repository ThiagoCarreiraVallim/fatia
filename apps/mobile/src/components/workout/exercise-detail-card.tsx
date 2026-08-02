import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Play, Trash2, Trophy } from 'lucide-react-native';
import { workoutApi, type SessionSet, type WorkoutPlanExercise } from '@fatia/api-client';
import { Input } from '@/components/ui';
import { useOpenExerciseDetail } from './exercise-detail-host';

/**
 * Réplica de `apps/web/src/components/workout/exercise-detail-card.tsx`.
 *
 * O caminho e o nome deste componente são contrato: a tela de sessão ativa
 * (outra fatia do port) importa daqui, exatamente como no PWA.
 *
 * Duas diferenças em relação ao web, as duas por limitação do bottom sheet
 * nativo ou da divisão de trabalho:
 *
 * - o drawer de detalhe não mora aqui, mora em `<ExerciseDetailHost>`, que
 *   precisa envolver a tela (ver `exercise-detail-host.tsx`);
 * - `renderSet` é ponto de injeção. No PWA o modo `readonly` monta `SetRow`
 *   direto, e `SetRow` sabe editar a série pela API. Aqui a linha editável mora
 *   com a sessão ativa; sem a injeção este arquivo importaria de `./session/`,
 *   criando um ciclo entre as duas fatias.
 */

interface PlanItemLike {
  id: string;
  exercise: WorkoutPlanExercise['exercise'];
  targetSets: number;
  targetReps: string;
}

interface PlanCardProps {
  mode: 'plan';
  item: PlanItemLike;
  isCardio?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Troca em voo: trava os dois botões até a API responder. */
  isMoving?: boolean;
  onChangeSets?: (value: number) => void;
  onChangeReps?: (value: string) => void;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

interface SessionCardProps {
  mode: 'readonly';
  item: PlanItemLike;
  isCardio?: boolean;
  loggedSets?: SessionSet[];
  /** Quando presente, as séries podem ser editadas — ver `renderSet`. */
  sessionId?: string;
  /** Quando `false`, esconde o excluir de cada série. Padrão: `true`. */
  canDeleteSet?: boolean;
  /** Linha de série customizada (a sessão ativa injeta a sua, editável). */
  renderSet?: (args: {
    set: SessionSet;
    index: number;
    isCardio: boolean;
    sessionId?: string;
    showDelete: boolean;
  }) => ReactNode;
}

type Props = PlanCardProps | SessionCardProps;

function Header({ item, isCardio }: { item: PlanItemLike; isCardio?: boolean }) {
  const openDetail = useOpenExerciseDetail();

  return (
    <View className="flex-row gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver detalhes de ${item.exercise.name}`}
        onPress={() => openDetail(item.exercise.id)}
        className="h-20 w-24 items-center justify-center overflow-hidden rounded-xl bg-muted active:opacity-80"
      >
        <Play size={20} color="#e5e2e1" fill="#e5e2e1" />
      </Pressable>

      <View className="min-w-0 flex-1">
        <Text className="text-base font-extrabold leading-tight text-foreground">
          {item.exercise.name}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">{item.exercise.muscleGroup}</Text>
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {isCardio ? (
            <View className="rounded-md bg-accent px-2 py-0.5">
              <Text className="text-[10px] font-bold text-primary">CARDIO</Text>
            </View>
          ) : (
            <>
              <View className="rounded-md bg-muted px-2 py-0.5">
                <Text className="text-[10px] font-bold text-foreground">
                  {item.targetSets} Séries
                </Text>
              </View>
              <View className="rounded-md bg-muted px-2 py-0.5">
                <Text className="text-[10px] font-bold text-foreground">
                  {item.targetReps} Reps
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export function ExerciseDetailCard(props: Props) {
  if (props.mode === 'readonly') return <SessionModeCard {...props} />;
  return <PlanModeCard {...props} />;
}

function Cell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <View className={wide ? 'flex-1' : 'w-10'}>{children}</View>;
}

function ColumnHeader({ children, wide }: { children: string; wide?: boolean }) {
  return (
    <Cell wide={wide}>
      <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">{children}</Text>
    </Cell>
  );
}

function SessionModeCard({
  item,
  loggedSets = [],
  isCardio,
  sessionId,
  canDeleteSet = true,
  renderSet,
}: SessionCardProps) {
  const showDelete = Boolean(sessionId) && canDeleteSet;

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <Header item={item} isCardio={isCardio} />

      {loggedSets.length > 0 ? (
        <View className="mt-4 gap-1.5">
          <View className="flex-row items-center gap-2">
            <ColumnHeader>Série</ColumnHeader>
            {isCardio ? (
              <>
                <ColumnHeader wide>Duração</ColumnHeader>
                <ColumnHeader wide>Distância</ColumnHeader>
                <ColumnHeader wide>BPM</ColumnHeader>
              </>
            ) : (
              <>
                <ColumnHeader wide>Reps</ColumnHeader>
                <ColumnHeader wide>Carga (kg)</ColumnHeader>
                <ColumnHeader wide>RPE</ColumnHeader>
              </>
            )}
            {showDelete ? <Cell>{null}</Cell> : null}
          </View>

          {loggedSets.map((s, index) =>
            renderSet ? (
              <View key={s.id}>
                {renderSet({ set: s, index, isCardio: Boolean(isCardio), sessionId, showDelete })}
              </View>
            ) : (
              <ReadonlySetRow
                key={s.id}
                set={s}
                index={index}
                isCardio={Boolean(isCardio)}
                reserveDeleteColumn={showDelete}
              />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

function formatMeters(meters: number | null): string {
  if (meters == null) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters} m`;
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function ReadonlySetRow({
  set,
  index,
  isCardio,
  reserveDeleteColumn,
}: {
  set: SessionSet;
  index: number;
  isCardio: boolean;
  reserveDeleteColumn: boolean;
}) {
  const values = isCardio
    ? [
        formatSeconds(set.durationSeconds),
        formatMeters(set.distanceMeters),
        set.avgHeartRate != null ? String(set.avgHeartRate) : '—',
      ]
    : [
        set.reps != null ? String(set.reps) : '—',
        set.weightKg != null ? String(set.weightKg) : '—',
        set.rpe != null ? String(set.rpe) : '—',
      ];

  return (
    <View className="flex-row items-center gap-2 rounded-lg bg-muted px-1 py-2">
      <Cell>
        <Text className="text-xs font-bold text-muted-foreground">{index + 1}</Text>
      </Cell>
      {values.map((value, i) => (
        <Cell key={i} wide>
          <Text className="text-sm text-foreground">{value}</Text>
        </Cell>
      ))}
      {reserveDeleteColumn ? <Cell>{null}</Cell> : null}
    </View>
  );
}

function PlanModeCard({
  item,
  isCardio,
  isFirst,
  isLast,
  isMoving,
  onChangeSets,
  onChangeReps,
  onRemove,
  onMoveUp,
  onMoveDown,
}: PlanCardProps) {
  const [sets, setSets] = useState(String(item.targetSets));
  const [reps, setReps] = useState(item.targetReps);

  const pr = useQuery({
    queryKey: ['workout', 'pr', item.exercise.id],
    queryFn: () => workoutApi.getPersonalRecord(item.exercise.id),
    staleTime: 60_000,
  });
  const prWeight =
    pr.data && 'weightKg' in pr.data && pr.data.weightKg != null ? pr.data.weightKg : null;
  const prReps = pr.data && 'reps' in pr.data && pr.data.reps != null ? pr.data.reps : null;
  const prDistance =
    pr.data && 'distanceMeters' in pr.data && pr.data.distanceMeters != null
      ? pr.data.distanceMeters
      : null;

  const prLabel =
    prWeight != null
      ? `${prWeight}kg${prReps != null ? ` × ${prReps}` : ''}`
      : prDistance != null
        ? `${prDistance}m`
        : null;

  function commitSets() {
    const n = parseInt(sets, 10);
    if (!isNaN(n) && n > 0 && n !== item.targetSets) onChangeSets?.(n);
    else setSets(String(item.targetSets));
  }

  function commitReps() {
    const v = reps.trim();
    if (v && v !== item.targetReps) onChangeReps?.(v);
    else setReps(item.targetReps);
  }

  return (
    <View className="rounded-2xl border border-border bg-card p-4">
      <Header item={item} isCardio={isCardio} />

      {prLabel ? (
        <View className="mt-3 flex-row items-center gap-1.5 self-start rounded-full bg-accent px-2.5 py-1">
          <Trophy size={12} color="#2ce500" />
          <Text className="text-[11px] font-bold text-primary">Recorde: {prLabel}</Text>
        </View>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between gap-3">
        {isCardio ? (
          <Text className="flex-1 text-[11px] text-muted-foreground">
            Duração e distância são logadas durante a sessão.
          </Text>
        ) : (
          <View className="flex-1 flex-row items-center gap-2">
            <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
              SÉRIES
            </Text>
            <Input
              value={sets}
              onChangeText={setSets}
              onBlur={commitSets}
              inputMode="numeric"
              accessibilityLabel={`Séries de ${item.exercise.name}`}
              className="w-14 px-1 text-center"
            />
            <Text className="text-xs text-muted-foreground">×</Text>
            <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">REPS</Text>
            <Input
              value={reps}
              onChangeText={setReps}
              onBlur={commitReps}
              accessibilityLabel={`Repetições de ${item.exercise.name}`}
              className="w-20 px-1 text-center"
            />
          </View>
        )}

        <View className="flex-row items-center">
          {onMoveUp ? (
            <IconAction
              label={`Mover ${item.exercise.name} para cima`}
              disabled={isFirst || isMoving}
              onPress={onMoveUp}
            >
              <ChevronUp size={18} color={isFirst || isMoving ? '#333333' : '#baccaf'} />
            </IconAction>
          ) : null}
          {onMoveDown ? (
            <IconAction
              label={`Mover ${item.exercise.name} para baixo`}
              disabled={isLast || isMoving}
              onPress={onMoveDown}
            >
              <ChevronDown size={18} color={isLast || isMoving ? '#333333' : '#baccaf'} />
            </IconAction>
          ) : null}
          {onRemove ? (
            <IconAction label={`Remover ${item.exercise.name} do plano`} onPress={onRemove}>
              <Trash2 size={18} color="#baccaf" />
            </IconAction>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function IconAction({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
    >
      {children}
    </Pressable>
  );
}

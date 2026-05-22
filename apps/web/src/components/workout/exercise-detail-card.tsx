'use client';

import { useState } from 'react';
import { Play, Trash2, ChevronUp, ChevronDown, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { workoutApi, type SessionSet, type WorkoutPlanExercise } from '@/lib/api/workout';
import { SetRow } from './set-row';

interface PlanItemLike {
  id: string;
  exercise: WorkoutPlanExercise['exercise'];
  targetSets: number;
  targetReps: string;
}

interface PlanCardProps {
  mode: 'plan';
  item: PlanItemLike;
  isFirst?: boolean;
  isLast?: boolean;
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
  /** When provided, sets become editable (blur/glass style) and persist via API. */
  sessionId?: string;
  /** When false, hides per-set delete button. Defaults to true. */
  canDeleteSet?: boolean;
}

type Props = PlanCardProps | SessionCardProps;

function Header({ item }: { item: PlanItemLike }) {
  return (
    <div className="flex gap-3">
      <div className="relative flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        <div className="absolute inset-0 bg-gradient-to-br from-black/50 to-transparent" />
        <Play size={20} fill="white" className="relative text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-extrabold leading-tight text-foreground">
          {item.exercise.name}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.exercise.muscleGroup}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
            {item.targetSets} Séries
          </span>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
            {item.targetReps} Reps
          </span>
        </div>
      </div>
    </div>
  );
}

export function ExerciseDetailCard(props: Props) {
  if (props.mode === 'readonly') {
    return <SessionModeCard {...props} />;
  }
  return <PlanModeCard {...props} />;
}

function SessionModeCard({
  item,
  loggedSets = [],
  isCardio,
  sessionId,
  canDeleteSet = true,
}: SessionCardProps) {
  const editable = !!sessionId;
  const showDelete = editable && canDeleteSet;
  const gridCols = showDelete
    ? 'grid-cols-[36px_1fr_1fr_1fr_32px]'
    : 'grid-cols-[40px_1fr_1fr_1fr]';

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <Header item={item} />
      {loggedSets.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div
            className={`grid ${gridCols} gap-2 text-[10px] font-bold tracking-wide text-muted-foreground`}
          >
            <div>Série</div>
            {isCardio ? (
              <>
                <div>Duração</div>
                <div>Distância</div>
                <div>BPM</div>
              </>
            ) : (
              <>
                <div>Reps</div>
                <div>Carga (kg)</div>
                <div>RPE</div>
              </>
            )}
            {showDelete && <div />}
          </div>
          {loggedSets.map((s, idx) => (
            <SetRow
              key={s.id}
              set={s}
              index={idx}
              isCardio={!!isCardio}
              sessionId={sessionId}
              showDelete={showDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanModeCard({
  item,
  isFirst,
  isLast,
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

  const prLabel =
    prWeight != null
      ? `${prWeight}kg${prReps != null ? ` × ${prReps}` : ''}`
      : prDistance != null
        ? `${prDistance}m`
        : null;

  return (
    <div className="rounded-2xl border border-white/5 bg-card p-4">
      <Header item={item} />

      {prLabel && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
          <Trophy size={12} />
          Recorde: {prLabel}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold tracking-wide text-muted-foreground">
            SÉRIES
          </label>
          <Input
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            onBlur={commitSets}
            inputMode="numeric"
            className="h-8 w-14 px-1 text-center text-sm"
            aria-label="Séries"
          />
          <span className="text-xs text-muted-foreground">×</span>
          <label className="text-[10px] font-bold tracking-wide text-muted-foreground">REPS</label>
          <Input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={commitReps}
            className="h-8 w-20 px-1 text-center text-sm"
            aria-label="Repetições"
          />
        </div>

        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={isFirst}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
              aria-label="Mover para cima"
            >
              <ChevronUp size={16} />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={isLast}
              className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
              aria-label="Mover para baixo"
            >
              <ChevronDown size={16} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1 text-muted-foreground hover:text-rose-500"
              aria-label="Remover exercício"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Dumbbell, Link2, Trash2 } from 'lucide-react';
import {
  formatRest,
  isCardioExercise,
  muscleGroupName,
  planExerciseSummary,
  workoutApi,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { ExerciseDetailDrawer } from './exercise-detail-drawer';
import { useReorderFocus } from './use-reorder-focus';

/**
 * Uma linha do plano (Al-T7). A imagem abre o Como fazer; o resto da linha abre
 * o Configurar. No modo de edição aparecem as setas e a lixeira.
 */
export function PlanExerciseRow({
  item,
  editing,
  isFirst,
  isLast,
  isMoving,
  onConfigure,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: WorkoutPlanExercise;
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  isMoving: boolean;
  onConfigure: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['workout', 'exercise', item.exercise.id],
    queryFn: () => workoutApi.getExercise(item.exercise.id),
    enabled: detailOpen,
  });
  const { upRef, downRef, markUp, markDown } = useReorderFocus(isMoving);
  const name = item.exercise.name;
  const cardio = isCardioExercise(item.exercise);

  return (
    <li className="rounded-2xl border border-subtle bg-card p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Ver detalhes de ${name}`}
          onClick={() => setDetailOpen(true)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"
        >
          <Dumbbell size={20} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Configurar ${name}`}
          onClick={onConfigure}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {muscleGroupName(item.exercise.muscleGroup)}
              {item.exercise.equipment ? ` · ${item.exercise.equipment}` : ''}
            </span>
            {item.biSetWithNext && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                <Link2 size={12} aria-hidden />
                bi-set com o próximo
              </span>
            )}
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-extrabold tabular-nums">
              {planExerciseSummary(item)}
            </span>
            {!cardio && item.restSeconds != null && (
              <span className="block text-[11px] text-muted-foreground tabular-nums">
                {formatRest(item.restSeconds)}
              </span>
            )}
          </span>
        </button>
      </div>

      {editing && (
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-subtle pt-2">
          <button
            ref={upRef}
            type="button"
            aria-label={`Mover ${name} para cima`}
            disabled={isFirst || isMoving}
            onClick={() => {
              markUp();
              onMoveUp();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30"
          >
            <ArrowUp size={18} />
          </button>
          <button
            ref={downRef}
            type="button"
            aria-label={`Mover ${name} para baixo`}
            disabled={isLast || isMoving}
            onClick={() => {
              markDown();
              onMoveDown();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent disabled:opacity-30"
          >
            <ArrowDown size={18} />
          </button>
          <button
            type="button"
            aria-label={`Remover ${name} do plano`}
            onClick={onRemove}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}

      <ExerciseDetailDrawer
        exercise={detail.data ?? null}
        open={detailOpen && !!detail.data}
        onOpenChange={(o) => {
          if (!o) setDetailOpen(false);
        }}
      />
    </li>
  );
}

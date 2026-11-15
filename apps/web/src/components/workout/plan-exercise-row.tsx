'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Link2, Play, Trash2 } from 'lucide-react';
import {
  formatRest,
  isCardioExercise,
  muscleGroupName,
  planExerciseSummary,
  workoutApi,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { ExerciseDetailDrawer } from './exercise-detail-drawer';
import { groupTone } from './group-tone';
import { useReorderFocus } from './use-reorder-focus';

/**
 * A imagem do exercício nas listas de plano (Al-T7, Al-T8, Al-T19): o quadrado
 * de 56 px com o play e a borda de baixo na cor do grupo.
 */
export function ExerciseThumb({ group, size = 56 }: { group: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, boxShadow: `inset 0 -3px 0 ${groupTone(group)}` }}
      className="flex shrink-0 items-center justify-center rounded-[14px] bg-muted text-muted-foreground"
    >
      <Play size={16} />
    </span>
  );
}

/** "■ Peito  barra": o quadradinho e o nome do grupo, e o equipamento em cinza. */
export function ExerciseGroupLine({
  group,
  detail,
  className,
}: {
  group: string;
  detail?: string | null;
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
      <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-xs font-semibold text-muted-foreground">
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-[2px]"
          style={{ background: groupTone(group) }}
        />
        {muscleGroupName(group)}
      </span>
      {detail && <span className="text-xs text-faint">{detail}</span>}
    </span>
  );
}

/**
 * Uma linha do plano (Al-T7), dentro do card único da lista. A imagem abre o
 * Como fazer. Vendo, o nome também abre o Como fazer; editando, abre o
 * Configurar, e aparecem as setas e a lixeira.
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
  const arrow =
    'flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground disabled:opacity-30';

  return (
    <li
      className={cn(
        'flex min-h-[76px] items-center gap-3 py-2.5',
        !isFirst && 'border-t border-border',
      )}
    >
      {editing && (
        <span className="flex shrink-0 flex-col gap-1">
          <button
            ref={upRef}
            type="button"
            aria-label={`Mover ${name} para cima`}
            disabled={isFirst || isMoving}
            onClick={() => {
              markUp();
              onMoveUp();
            }}
            className={arrow}
          >
            <ChevronUp size={16} aria-hidden />
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
            className={arrow}
          >
            <ChevronDown size={16} aria-hidden />
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={`Ver detalhes de ${name}`}
        onClick={() => setDetailOpen(true)}
        className="shrink-0"
      >
        <ExerciseThumb group={item.exercise.muscleGroup} />
      </button>
      <button
        type="button"
        aria-label={editing ? `Configurar ${name}` : `Como fazer ${name}`}
        onClick={editing ? onConfigure : () => setDetailOpen(true)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="block text-[15px] font-semibold leading-tight text-foreground">
            {name}
          </span>
          <ExerciseGroupLine group={item.exercise.muscleGroup} detail={item.exercise.equipment} />
          {item.biSetWithNext && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-steps">
              <Link2 size={14} aria-hidden />
              bi-set com o próximo
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-bold tabular-nums text-foreground">
            {planExerciseSummary(item)}
          </span>
          {!cardio && item.restSeconds != null && (
            <span className="block text-xs text-faint tabular-nums">
              {formatRest(item.restSeconds)}
            </span>
          )}
        </span>
      </button>
      {editing && (
        <button
          type="button"
          aria-label={`Remover ${name} do plano`}
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:text-danger"
        >
          <Trash2 size={16} aria-hidden />
        </button>
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

'use client';

import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, Play, Trash2 } from 'lucide-react';
import type { ExerciseGroup } from '@fatia/api-client';
import { Button } from '@/components/ui/button';

/**
 * O pé de cada card da lista abaixo do foco: "Fazer agora" à esquerda, que é o
 * que se procura no meio do treino (o aparelho do próximo está ocupado), e as
 * ações de arrumação à direita, menores. Réplica do `ExerciseActions` do app.
 */
export function ExerciseActions({
  group,
  isFirst,
  isLast,
  disabled,
  onDoNow,
  onMove,
  onRemove,
}: {
  group: ExerciseGroup;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onDoNow: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
}) {
  const target = group.targetSets ?? 0;
  const done = group.isCardio ? group.sets.length > 0 : target > 0 && group.sets.length >= target;

  return (
    <div className="mt-3 flex items-center gap-1 border-t border-subtle pt-3">
      {done ? (
        <p className="flex-1 text-xs font-bold text-primary">✓ Concluído</p>
      ) : (
        <Button
          size="sm"
          className="mr-auto rounded-full px-4 text-xs font-extrabold"
          aria-label={`Fazer ${group.exerciseName} agora`}
          onClick={onDoNow}
        >
          <Play size={14} fill="currentColor" />
          Fazer agora
        </Button>
      )}

      <IconAction
        label={`Mover ${group.exerciseName} para cima`}
        disabled={isFirst || disabled}
        onClick={() => onMove('up')}
      >
        <ChevronUp size={20} />
      </IconAction>
      <IconAction
        label={`Mover ${group.exerciseName} para baixo`}
        disabled={isLast || disabled}
        onClick={() => onMove('down')}
      >
        <ChevronDown size={20} />
      </IconAction>
      <IconAction label={`Tirar ${group.exerciseName} deste treino`} onClick={onRemove}>
        <Trash2 size={18} className="text-danger" />
      </IconAction>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-subtle text-foreground hover:bg-accent disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import {
  feelingOf,
  formatBestSet,
  newSetClientKey,
  rpeToFeeling,
  workoutApi,
  type ExerciseGroup,
} from '@fatia/api-client';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { SetEditor } from './set-chips';

/**
 * "Treino atual" (prancha Al-T17): o treino inteiro numa folha, para arrumar
 * sem sair da sessão. Cada exercício mostra as séries (tocar edita), ganha
 * "+ Série" (copia a última; sem nenhuma, leva à sessão para preencher),
 * setas para mudar a ordem (só desta sessão) e "Tirar do treino" — que a
 * página confirma.
 */
export function CurrentWorkoutSheet({
  open,
  onOpenChange,
  sessionId,
  groups,
  onAddExercise,
  onRemove,
  onFinish,
  onCancel,
  onMove,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  groups: ExerciseGroup[];
  onAddExercise: () => void;
  onRemove: (group: ExerciseGroup) => void;
  onFinish: () => void;
  /** "Cancelar treino", que saiu do cabeçalho da sessão (prancha Al-T3). */
  onCancel?: () => void;
  onMove: (exerciseId: number, direction: 'up' | 'down') => void;
  /** Leva o exercício para a sessão, onde a primeira série é preenchida. */
  onStart: (exerciseId: number) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          {/* Como na prancha Al-T17: o título no meio e o Finalizar à direita;
              o espaço da esquerda equilibra o título. */}
          <div className="flex items-center justify-between gap-2">
            <span aria-hidden className="w-[92px]" />
            <DrawerTitle className="min-w-0 truncate text-center font-display text-[17px] font-semibold">
              Treino atual
            </DrawerTitle>
            <button
              type="button"
              onClick={onFinish}
              className="anim-press h-11 w-[92px] shrink-0 rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
            >
              Finalizar
            </button>
          </div>
          <DrawerDescription className="sr-only">
            Mude séries, tire ou ponha exercícios. O plano não muda.
          </DrawerDescription>
        </DrawerHeader>

        <ul className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          {groups.map((g, index) => (
            <CurrentExercise
              key={g.exerciseId}
              sessionId={sessionId}
              group={g}
              isFirst={index === 0}
              isLast={index === groups.length - 1}
              onRemove={() => onRemove(g)}
              onMove={(direction) => onMove(g.exerciseId, direction)}
              onStart={() => onStart(g.exerciseId)}
            />
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAddExercise}
            className="anim-press flex h-14 items-center justify-center gap-1.5 rounded-full bg-muted px-5 text-[15px] font-bold text-foreground"
          >
            + Exercício
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="anim-press h-14 flex-1 rounded-full bg-foreground text-[15px] font-extrabold text-background"
          >
            Voltar ao treino
          </button>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="anim-press mx-auto mt-2 flex h-11 items-center px-4 text-[13px] font-bold text-muted-foreground"
          >
            Cancelar treino
          </button>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function CurrentExercise({
  sessionId,
  group,
  isFirst,
  isLast,
  onRemove,
  onMove,
  onStart,
}: {
  sessionId: string;
  group: ExerciseGroup;
  isFirst: boolean;
  isLast: boolean;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onStart: () => void;
}) {
  const qc = useQueryClient();
  const clientKey = useRef<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const units = useUnitPrefs();
  const last = group.sets[group.sets.length - 1];
  const target = group.targetSets ?? 0;
  const done = target > 0 && group.sets.length >= target;
  const inProgress = !done && group.sets.length > 0;
  const editingSet = group.sets.find((s) => s.id === editing) ?? null;

  // "+ Série": a mesma carga e as mesmas repetições da última, com chave
  // própria — o duplo toque não grava duas. Sem última, não há o que copiar:
  // uma série vazia contaria no progresso (a API também recusa).
  const addSet = useMutation({
    mutationFn: (key: string) =>
      workoutApi.logSet(sessionId, {
        exerciseId: group.exerciseId,
        weightKg: last?.weightKg ?? undefined,
        reps: last?.reps ?? undefined,
        durationSeconds: last?.durationSeconds ?? undefined,
        distanceMeters: last?.distanceMeters ?? undefined,
        clientKey: key,
      }),
    onSuccess: () => {
      clientKey.current = null;
      void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    },
  });

  const arrow =
    'anim-press flex h-11 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30';

  return (
    <li
      className={cn(
        'rounded-card bg-muted/60 px-4',
        inProgress && 'shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.6)]',
      )}
    >
      <div className="flex items-center gap-1 py-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold text-foreground">
            {group.exerciseName}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {group.sets.length}
            {target ? ` de ${target}` : ''}{' '}
            {(target || group.sets.length) === 1 ? 'série' : 'séries'}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Subir ${group.exerciseName}`}
          disabled={isFirst}
          onClick={() => onMove('up')}
          className={arrow}
        >
          <ChevronUp size={18} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Descer ${group.exerciseName}`}
          disabled={isLast}
          onClick={() => onMove('down')}
          className={arrow}
        >
          <ChevronDown size={18} aria-hidden />
        </button>
        {done ? (
          <span className="ms-1 shrink-0 text-[13px] font-bold text-muted-foreground">✓ Feito</span>
        ) : (
          <button
            type="button"
            onClick={onStart}
            aria-label={`${inProgress ? 'Continuar' : 'Iniciar'} ${group.exerciseName}`}
            className={cn(
              'anim-press ms-1 h-10 shrink-0 rounded-full px-3.5 text-[13px] font-bold',
              inProgress ? 'bg-primary text-primary-foreground' : 'bg-surface-3 text-foreground',
            )}
          >
            {inProgress ? 'Continuar' : 'Iniciar'}
          </button>
        )}
      </div>

      {group.sets.length > 0 && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-t border-border text-xs text-faint">
              <th scope="col" className="w-6 py-2 font-normal">
                #
              </th>
              <th scope="col" className="py-2 font-normal">
                {group.isCardio ? 'distância · tempo' : 'carga × reps'}
              </th>
              <th scope="col" className="w-[84px] py-2 font-normal">
                como
              </th>
            </tr>
          </thead>
          <tbody>
            {group.sets.map((set, i) => {
              const feeling = feelingOf(rpeToFeeling(set.rpe));
              const on = editing === set.id;
              return (
                <tr key={set.id} className="h-[52px] border-t border-border">
                  <td className="text-[13px] text-faint">{i + 1}</td>
                  <td className="text-[15px] font-bold text-foreground tabular-nums">
                    {formatBestSet(set, units.loadUnit)}
                  </td>
                  <td>
                    <span className="flex items-center justify-end gap-2">
                      <span aria-hidden className="w-6 text-center text-lg">
                        {feeling?.emoji ?? ''}
                      </span>
                      <button
                        type="button"
                        aria-label={`Corrigir série ${i + 1} de ${group.exerciseName}`}
                        aria-expanded={on}
                        onClick={() => setEditing(on ? null : set.id)}
                        className={cn(
                          'anim-press flex h-11 w-11 items-center justify-center rounded-field',
                          on
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-3 text-foreground',
                        )}
                      >
                        <Pencil size={15} aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editingSet && (
        <SetEditor
          key={editingSet.id}
          sessionId={sessionId}
          set={editingSet}
          index={group.sets.indexOf(editingSet)}
          isCardio={group.isCardio}
          onDone={() => setEditing(null)}
        />
      )}

      <div className="flex items-center justify-between border-t border-border">
        <button
          type="button"
          aria-label={`Mais uma série de ${group.exerciseName}`}
          disabled={addSet.isPending}
          onClick={() => {
            if (!last) {
              onStart();
              return;
            }
            clientKey.current ??= newSetClientKey();
            addSet.mutate(clientKey.current);
          }}
          className="anim-press flex min-h-[52px] items-center gap-1.5 text-sm font-bold text-primary-text disabled:opacity-60"
        >
          <Plus size={16} aria-hidden />
          Série
        </button>
        <button
          type="button"
          aria-label={`Tirar ${group.exerciseName} do treino`}
          onClick={onRemove}
          className="anim-press min-h-[52px] text-[13px] font-semibold text-muted-foreground hover:text-danger"
        >
          Tirar do treino
        </button>
      </div>
    </li>
  );
}

'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import {
  groupExerciseApi,
  type DocumentExerciseView,
  type PlanDefaults,
} from '@fatia/api-client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ExerciseHit {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string | null;
  fromGroup: boolean;
  /** Favorito da equipe (#408): vem primeiro na busca. */
  favorite?: boolean;
  /** O padrão da academia ao entrar num plano (#408, Pn-11b). */
  defaults?: PlanDefaults | null;
}

export const isCardioGroup = (muscleGroup: string | null | undefined) => muscleGroup === 'cardio';

/**
 * A linha nova, com a prescrição padrão de força ou de cardio. O padrão da
 * academia (Pn-11b) vale por cima do nosso, menos dentro do circuito, que tem
 * a própria cadência.
 */
export function newExerciseRow(hit: ExerciseHit, inCircuit = false): DocumentExerciseView {
  const base = {
    type: 'exercise' as const,
    exerciseId: hit.exerciseId,
    name: hit.name,
    muscleGroup: hit.muscleGroup,
    equipment: hit.equipment,
    isCardio: isCardioGroup(hit.muscleGroup),
    hasGuide: false,
  };
  if (base.isCardio) {
    return {
      ...base,
      targetSets: 1,
      targetReps: '1',
      cardioTarget: 'TIME',
      cardioDurationSeconds: 1200,
    };
  }
  const d = hit.defaults;
  if (inCircuit) return { ...base, targetSets: 1, targetReps: d?.reps ?? '10' };
  return {
    ...base,
    targetSets: d?.sets ?? 3,
    targetReps: d?.reps ?? '10',
    restSeconds: d?.restSeconds ?? 90,
    ...(d?.loadMode ? { loadMode: d.loadMode } : {}),
  };
}

/**
 * Busca de exercício do editor: o catálogo da equipe (o geral e os da
 * comunidade), com os favoritos da equipe primeiro (#408). O cardio da
 * prancha é um filtro sobre a mesma busca.
 */
export function ExerciseSearch({
  groupId,
  label,
  onPick,
  cardioOnly = false,
  exclude,
  autoFocus,
}: {
  groupId: string;
  label: string;
  onPick: (hit: ExerciseHit) => void;
  cardioOnly?: boolean;
  /** Os ids que já estão na sessão (o mesmo exercício duas vezes fica para a #418). */
  exclude: ReadonlySet<number>;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const term = q.trim();
  const catalog = useQuery({
    queryKey: ['community', 'org', groupId, 'exercises', 'search', term],
    queryFn: () => groupExerciseApi.list(groupId, { q: term, limit: 24 }),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });

  const hits: ExerciseHit[] =
    term.length >= 2
      ? (catalog.data?.items ?? []).map((i) => ({
          exerciseId: i.exerciseId,
          name: i.name,
          muscleGroup: i.muscleGroup,
          equipment: i.equipment,
          fromGroup: i.ownedByCommunity,
          favorite: i.favorite,
          defaults: i.defaults,
        }))
      : [];
  const shown = hits.filter((h) => !cardioOnly || isCardioGroup(h.muscleGroup)).slice(0, 8);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter escolhe o primeiro (e não envia o formulário em volta).
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const first = shown.find((h) => !exclude.has(h.exerciseId));
            if (first) {
              onPick(first);
              setQ('');
            }
          }}
          placeholder={cardioOnly ? 'Esteira, bike, remo...' : 'Buscar exercício'}
          className="h-10 pl-9"
          autoComplete="off"
        />
      </div>
      {term.length >= 2 && (
        <ul className="divide-y divide-subtle overflow-hidden rounded-xl border border-subtle">
          {shown.length === 0 ? (
            <li className="p-3 text-xs text-muted-foreground">
              {catalog.isFetching ? 'Buscando...' : 'Nada com esse nome.'}
            </li>
          ) : (
            shown.map((h) => {
              const already = exclude.has(h.exerciseId);
              return (
                <li key={h.exerciseId}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onPick(h);
                      setQ('');
                    }}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{h.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          h.muscleGroup,
                          h.equipment,
                          h.fromGroup ? 'da comunidade' : null,
                          h.favorite ? 'favorito da equipe' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {already ? ' · já está na sessão' : ''}
                      </span>
                    </span>
                    <Plus size={16} aria-hidden className="shrink-0 text-primary" />
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

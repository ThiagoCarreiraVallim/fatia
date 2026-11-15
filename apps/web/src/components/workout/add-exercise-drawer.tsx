'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star } from 'lucide-react';
import {
  addSelectionLabel,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/selection';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { CommunityBadge, MyGymToggle, useInCommunity } from './my-gym-filter';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só marca "já no plano": repetir exercício é permitido desde a #378. */
  existingExerciseIds: Set<number>;
  /** Com plano: seleção múltipla gravada numa requisição só (Al-T8). */
  planId?: string;
  planName?: string;
  /** Sem plano ainda (Novo plano, Al-T19): seleção múltipla devolvida a quem chamou. */
  onAddMany?: (exercises: Exercise[]) => void;
  /** Um exercício por vez, sem gravar (treino rápido, sessão). */
  onAdd?: (exercise: Exercise) => void;
  /** Mantido por compatibilidade: a API põe no fim sozinha. */
  nextOrder?: number;
}

type Tab = 'favoritos' | 'todos' | (typeof MUSCLE_GROUPS)[number];

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'favoritos', label: 'Favoritos' },
  { value: 'todos', label: 'Todos' },
  ...MUSCLE_GROUPS.map((g) => ({ value: g as Tab, label: MUSCLE_GROUP_LABEL[g] })),
];

export function AddExerciseDrawer({
  open,
  onOpenChange,
  existingExerciseIds,
  planId,
  planName,
  onAddMany,
  onAdd,
}: Props) {
  const qc = useQueryClient();
  const multi = !!planId || !!onAddMany;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [naAcademia, setNaAcademia] = useState(false);
  const [tab, setTab] = useState<Tab>(multi ? 'favoritos' : 'todos');
  // Map e não Set: a seleção atravessa abas e buscas, e o lote precisa do
  // exercício inteiro (o Novo plano mostra nome e grupo sem buscar de novo).
  const [selected, setSelected] = useState<Map<number, Exercise>>(new Map());
  const emComunidade = useInCommunity(open);

  // Ajuste durante o render, e não num efeito (#187): limpa ao fechar.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setQ('');
      setDebounced('');
      setNaAcademia(false);
      setTab(multi ? 'favoritos' : 'todos');
      setSelected(new Map());
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const group = tab === 'favoritos' || tab === 'todos' ? undefined : tab;
  const search = useQuery({
    queryKey: ['workout', 'exercises', debounced, naAcademia, tab],
    queryFn: () =>
      workoutApi.searchExercises(debounced || undefined, group, {
        ...(naAcademia ? { onlyMyGym: true } : {}),
        ...(tab === 'favoritos' ? { favoritesOnly: true } : {}),
      }),
    enabled: open,
  });

  const addBatch = useMutation({
    mutationFn: (ids: number[]) => {
      if (!planId) throw new Error('planId required');
      return workoutApi.addPlanExercises(planId, ids);
    },
    onSuccess: (plan) => {
      if (planId) {
        if (plan?.exercises) qc.setQueryData(['workout', 'plan', planId], plan);
        qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
        qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      }
      onOpenChange(false);
    },
  });

  function toggle(exercise: Exercise) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(exercise.id)) next.delete(exercise.id);
      else next.set(exercise.id, exercise);
      return next;
    });
  }

  function confirm() {
    // Duplo toque não vira dois lotes: o botão trava enquanto o primeiro voa.
    if (selected.size === 0 || addBatch.isPending) return;
    const chosen = [...selected.values()];
    if (planId) {
      addBatch.mutate(chosen.map((e) => e.id));
    } else {
      onAddMany?.(chosen);
      onOpenChange(false);
    }
  }

  function pickSingle(exercise: Exercise) {
    onAdd?.(exercise);
    onOpenChange(false);
  }

  const results = search.data ?? [];
  const term = debounced.trim();
  const favEmpty = tab === 'favoritos' && !term && !search.isFetching && results.length === 0;
  const none = !search.isFetching && !favEmpty && results.length === 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{planName ? `Adicionar ao ${planName}` : 'Adicionar exercício'}</DrawerTitle>
          <DrawerDescription>
            {multi
              ? 'Marque quantos quiser. Eles entram no fim do plano, na ordem em que você marcou.'
              : 'Busque e selecione um exercício.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="relative my-3">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Buscar exercício"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: supino, corrida, agachamento..."
            className="pl-9"
          />
        </div>

        <div
          role="group"
          aria-label="Filtrar por grupo"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2"
        >
          {TABS.map((t) => (
            <Chip key={t.value} selected={tab === t.value} onClick={() => setTab(t.value)}>
              {t.value === 'favoritos' && <Star size={14} aria-hidden />}
              {t.label}
            </Chip>
          ))}
        </div>

        {emComunidade && (
          <div className="mb-2">
            <MyGymToggle checked={naAcademia} onChange={setNaAcademia} />
          </div>
        )}

        <ul className="-mx-4 max-h-[50vh] divide-y overflow-y-auto">
          {search.isFetching && (
            <li className="px-4 py-3 text-sm text-muted-foreground">Buscando...</li>
          )}
          {favEmpty && (
            <li className="px-4 py-3">
              <EmptyState
                icon={Star}
                title="Nenhum favorito ainda"
                description="Toque em Favoritar no Como fazer de um exercício. Ele aparece aqui e primeiro nas sugestões."
                action={
                  <Button variant="outline" size="sm" onClick={() => setTab('todos')}>
                    Ver todos os exercícios
                  </Button>
                }
              />
            </li>
          )}
          {none && (
            <li className="px-4 py-6 text-center">
              <p className="text-sm font-semibold">
                {term ? `Nada com “${term}”` : 'Nenhum exercício aqui.'}
              </p>
              {term && (
                <p className="text-xs text-muted-foreground">
                  Tente outro nome ou o grupo muscular
                </p>
              )}
            </li>
          )}
          {!search.isFetching &&
            results.map((exercise) => {
              const on = selected.has(exercise.id);
              const inPlan = existingExerciseIds.has(exercise.id);
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {exercise.favorite && (
                        <Star
                          size={12}
                          aria-hidden
                          className="shrink-0 fill-primary text-primary"
                        />
                      )}
                      <span className="truncate">{exercise.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{exercise.muscleGroup}</span>
                      {exercise.equipment ? ` · ${exercise.equipment}` : ''}
                      {inPlan ? ' · ' : ''}
                      {inPlan && <span>já no plano</span>}
                    </p>
                  </div>
                  {exercise.communityName ? (
                    <CommunityBadge name={exercise.communityName} />
                  ) : (
                    exercise.source === 'CUSTOM' && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">custom</span>
                    )
                  )}
                </>
              );
              return (
                <li key={exercise.id}>
                  {multi ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-label={exercise.name}
                      onClick={() => toggle(exercise)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px]',
                          on
                            ? 'bg-primary text-primary-foreground'
                            : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
                        )}
                      >
                        {on && <Check size={16} />}
                      </span>
                      {body}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pickSingle(exercise)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-accent"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
        </ul>

        {addBatch.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            Não foi possível adicionar. Tente de novo.
          </p>
        )}

        {multi ? (
          <Button
            className="mt-3 h-12 w-full rounded-full text-base font-bold"
            disabled={selected.size === 0 || addBatch.isPending}
            onClick={confirm}
          >
            {addBatch.isPending ? 'Adicionando...' : addSelectionLabel(selected.size)}
          </Button>
        ) : (
          <DrawerClose asChild>
            <Button variant="ghost" className="mt-2 w-full">
              Cancelar
            </Button>
          </DrawerClose>
        )}
      </DrawerContent>
    </Drawer>
  );
}

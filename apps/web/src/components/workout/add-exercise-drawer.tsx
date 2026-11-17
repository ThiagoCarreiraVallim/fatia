'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Play, Search, Star, X } from 'lucide-react';
import {
  addSelectionLabel,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { headerButtonClass } from '@/components/layout/tab-header';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { groupTone } from './group-tone';
import { CommunityBadge, MyGymToggle, useInCommunity } from './my-gym-filter';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Já no plano: aparece marcado e não entra de novo (um por plano; a sessão agrupa por exercício). */
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
  /** A aba que abre (o "Só cardio" do treino livre abre em Cardio, #381). */
  initialTab?: Tab;
}

export type AddExerciseTab = 'favoritos' | 'todos' | (typeof MUSCLE_GROUPS)[number];
type Tab = AddExerciseTab;

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
  initialTab,
}: Props) {
  const qc = useQueryClient();
  const multi = !!planId || !!onAddMany;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [naAcademia, setNaAcademia] = useState(false);
  const firstTab: Tab = initialTab ?? (multi ? 'favoritos' : 'todos');
  const [tab, setTab] = useState<Tab>(firstTab);
  // Map e não Set: a seleção atravessa abas e buscas, e o lote precisa do
  // exercício inteiro (o Novo plano mostra nome e grupo sem buscar de novo).
  const [selected, setSelected] = useState<Map<number, Exercise>>(new Map());
  const emComunidade = useInCommunity(open);

  // Ajuste durante o render, e não num efeito (#187): limpa ao fechar.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    // Ao abrir, a aba pedida agora (ela muda: o "Só cardio" só vale na primeira vez).
    if (open) setTab(firstTab);
    if (!open) {
      setQ('');
      setDebounced('');
      setNaAcademia(false);
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

  const count = selected.size;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Al-T8: tela cheia sobre a barra (z-50), no fundo da tela e não da folha. */}
      <DrawerContent className="mt-0 h-[100dvh] max-h-[100dvh] rounded-t-none bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-[env(safe-area-inset-top)] [&>div[aria-hidden]:first-child]:hidden">
        <DrawerHeader className="flex items-center gap-2 px-0 pt-3">
          <DrawerClose asChild>
            <button type="button" aria-label="Fechar" className={headerButtonClass()}>
              <X size={22} aria-hidden />
            </button>
          </DrawerClose>
          <DrawerTitle className="min-w-0 flex-1 truncate text-center font-display text-[17px] font-semibold leading-tight">
            {planName ? `Adicionar ao ${planName}` : 'Adicionar exercício'}
          </DrawerTitle>
          {multi ? (
            <span
              aria-label={`${count} ${count === 1 ? 'selecionado' : 'selecionados'}`}
              className={cn(
                'flex h-[22px] min-w-11 items-center justify-center rounded-pill px-[9px] text-[11px] font-extrabold tabular-nums',
                count ? 'bg-primary-soft text-primary-text' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}
            </span>
          ) : (
            <span aria-hidden className="w-11 shrink-0" />
          )}
          <DrawerDescription className="sr-only">
            {multi
              ? 'Marque quantos quiser. Eles entram no fim do plano, na ordem em que você marcou.'
              : 'Busque e selecione um exercício.'}
          </DrawerDescription>
        </DrawerHeader>

        <label className="relative mt-3 flex h-14 items-center gap-2.5 rounded-pill bg-card px-4 focus-within:ring-2 focus-within:ring-primary">
          <Search size={18} aria-hidden className="shrink-0 text-muted-foreground" />
          <input
            aria-label="Buscar exercício"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Supino, remada, agachamento..."
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-faint"
          />
        </label>

        <div
          role="group"
          aria-label="Filtrar por grupo"
          className="-mx-4 mt-3 flex shrink-0 gap-2 overflow-x-auto px-4 pb-1"
        >
          {TABS.map((t) => {
            const on = tab === t.value;
            const dot = t.value !== 'favoritos' && t.value !== 'todos';
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={on}
                onClick={() => setTab(t.value)}
                className={cn(
                  'anim-press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3.5 text-sm font-semibold',
                  on ? 'bg-foreground text-background' : 'bg-card text-muted-foreground',
                )}
              >
                {t.value === 'favoritos' && <Star size={14} aria-hidden />}
                {dot && (
                  <span
                    aria-hidden
                    className="h-[7px] w-[7px] rounded-[2px]"
                    style={{ background: groupTone(t.value) }}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>

        {emComunidade && (
          <div className="mt-2">
            <MyGymToggle checked={naAcademia} onChange={setNaAcademia} />
          </div>
        )}

        <div className="-mx-4 mt-3 min-h-0 flex-1 overflow-y-auto px-4">
          {search.isFetching && <p className="px-1 py-3 text-sm text-faint">Buscando...</p>}
          {favEmpty && (
            <div className="flex flex-col items-center gap-2 rounded-card bg-card px-6 py-8 text-center">
              <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--warning)/0.16)] text-steps">
                <Star size={20} aria-hidden />
              </span>
              <p className="font-display text-base font-bold">Nenhum favorito ainda</p>
              <p className="text-sm text-muted-foreground">
                Toque em Favoritar no Como fazer de um exercício. Ele aparece aqui e primeiro nas
                sugestões.
              </p>
              <button
                type="button"
                onClick={() => setTab('todos')}
                className="anim-press mt-1 inline-flex h-11 items-center gap-2 rounded-[12px] bg-muted px-[18px] text-sm font-bold text-foreground"
              >
                <Play size={16} aria-hidden />
                Ver todos os exercícios
              </button>
            </div>
          )}
          {none && (
            <div className="rounded-card bg-card px-4 py-6 text-center">
              <p className="text-sm font-semibold">
                {term ? `Nada com “${term}”` : 'Nenhum exercício aqui.'}
              </p>
              {term && <p className="text-xs text-faint">Tente outro nome ou o grupo muscular</p>}
            </div>
          )}
          {!search.isFetching && results.length > 0 && (
            <ul className="rounded-card bg-card px-4">
              {results.map((exercise, i) => {
                const on = selected.has(exercise.id);
                const inPlan = existingExerciseIds.has(exercise.id);
                const body = (
                  <>
                    <ExerciseThumb group={exercise.muscleGroup} />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                        <span className="min-w-0">{exercise.name}</span>
                        {exercise.favorite && (
                          <Star
                            size={14}
                            aria-label="favorito"
                            className="shrink-0 fill-current text-muted-foreground"
                          />
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ExerciseGroupLine
                          group={exercise.muscleGroup}
                          detail={inPlan ? 'já no plano' : exercise.equipment}
                        />
                        {exercise.communityName ? (
                          <CommunityBadge name={exercise.communityName} />
                        ) : (
                          exercise.source === 'CUSTOM' && (
                            <span className="rounded-pill bg-muted px-2 py-0.5 text-[11px] font-bold">
                              custom
                            </span>
                          )
                        )}
                      </span>
                    </span>
                  </>
                );
                const row = cn(
                  'flex min-h-[84px] w-full items-center gap-3 py-2.5 text-left disabled:opacity-50',
                  i > 0 && 'border-t border-border',
                );
                return (
                  <li key={exercise.id}>
                    {multi ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on || inPlan}
                        aria-label={exercise.name}
                        disabled={inPlan}
                        onClick={() => toggle(exercise)}
                        className={row}
                      >
                        {body}
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            on || inPlan
                              ? 'bg-primary text-primary-foreground'
                              : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
                          )}
                        >
                          {(on || inPlan) && <Check size={16} />}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={inPlan}
                        onClick={() => pickSingle(exercise)}
                        className={row}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {addBatch.isError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            Não foi possível adicionar. Tente de novo.
          </p>
        )}

        {multi && (
          <button
            type="button"
            className="anim-press mt-3 flex h-14 w-full shrink-0 items-center justify-center rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:bg-card disabled:text-faint"
            disabled={count === 0 || addBatch.isPending}
            onClick={confirm}
          >
            {addBatch.isPending ? 'Adicionando...' : addSelectionLabel(count)}
          </button>
        )}
      </DrawerContent>
    </Drawer>
  );
}

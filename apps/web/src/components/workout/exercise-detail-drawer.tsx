'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Star } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { groupTone } from './group-tone';
import { MuscleDiagram } from './muscle-diagram';
import { ExerciseEditDrawer } from './exercise-edit-drawer';
import { ExerciseVideo } from './exercise-media';
import { muscleLabelPt } from './muscle-labels';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import {
  feelingOf,
  formatBestSet,
  formatDecimal,
  kgToLoad,
  loadUnitLabel,
  muscleGroupLabel,
  workoutApi,
  type Exercise,
  type StrengthMuscleGroup,
} from '@fatia/api-client';

type Tab = 'steps' | 'muscles' | 'history';

const TABS: { value: Tab; label: string }[] = [
  { value: 'steps', label: 'Passos' },
  { value: 'muscles', label: 'Músculos' },
  { value: 'history', label: 'Seu histórico' },
];

const STRENGTH = new Set(['peito', 'costas', 'pernas', 'ombro', 'braço', 'core']);

function groupLabel(group: string): string {
  if (STRENGTH.has(group)) return muscleGroupLabel(group as StrengthMuscleGroup);
  return group.charAt(0).toUpperCase() + group.slice(1);
}

/** "2 de out. de 2026", lendo YYYY-MM-DD como dia local (sem pular de fuso). */
function longDate(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

const MECHANIC_LABEL: Record<string, string> = {
  compound: 'Composto',
  isolation: 'Isolado',
};

export function ExerciseDetailDrawer({ exercise, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  // A URL assinada do vídeo da comunidade pode vencer com a folha aberta: o
  // erro do player pede o exercício de novo (URL nova).
  const refreshVideo = () => {
    if (exercise) void qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise.id] });
  };

  // Editar um exercício base cria uma cópia editável (a base some das listagens
  // do usuário e aparece a cópia). Exercício custom é editado direto.
  const clone = useMutation({
    mutationFn: (id: number) => workoutApi.cloneExercise(id),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      if (exercise) qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise.id] });
      onOpenChange(false);
      setEditing(copy);
    },
  });

  // A estrela do Como fazer (#378): otimista, e volta atrás se a API recusar.
  // O estado é local porque o `exercise` chega de quem abriu o drawer (busca,
  // card do plano, sessão) e cada um guarda num cache diferente.
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [lastId, setLastId] = useState(exercise?.id);
  if (lastId !== exercise?.id) {
    setLastId(exercise?.id);
    setFavorite(null);
  }
  const isFavorite = favorite ?? exercise?.favorite ?? false;
  const favoriteMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      workoutApi.setExerciseFavorite(id, value),
    onMutate: ({ value }) => setFavorite(value),
    onError: (_e, { value }) => setFavorite(!value),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['workout', 'exercise', id] });
    },
  });

  const handleEdit = () => {
    if (!exercise) return;
    if (exercise.source === 'CUSTOM') {
      onOpenChange(false);
      setEditing(exercise);
    } else {
      clone.mutate(exercise.id);
    }
  };

  return (
    <>
      {exercise && (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="px-4 pb-6">
            {/* O vídeo no topo (prancha Al-T9): o da comunidade ganha do YouTube. */}
            <div className="pt-2">
              <ExerciseVideo exercise={exercise} onExpired={refreshVideo} />
            </div>

            <DrawerHeader className="px-0">
              <div className="flex items-start justify-between gap-3">
                <DrawerTitle className="font-display text-[26px] font-semibold leading-tight">
                  {exercise.name}
                </DrawerTitle>
                <button
                  type="button"
                  aria-pressed={isFavorite}
                  aria-label={`Favoritar ${exercise.name}`}
                  disabled={favoriteMutation.isPending}
                  onClick={() => favoriteMutation.mutate({ id: exercise.id, value: !isFavorite })}
                  className="-mt-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent"
                >
                  <Star
                    size={20}
                    aria-hidden
                    className={isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground'}
                  />
                </button>
              </div>
              <DrawerDescription className="sr-only">Como fazer {exercise.name}</DrawerDescription>
              <div className="flex flex-wrap items-center gap-2">
                {exercise.muscleGroup && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <span
                      aria-hidden
                      className="h-[7px] w-[7px] rounded-[2px]"
                      style={{ background: groupTone(exercise.muscleGroup) }}
                    />
                    {groupLabel(exercise.muscleGroup)}
                  </span>
                )}
                {details(exercise) && (
                  <span className="text-xs text-muted-foreground">{details(exercise)}</span>
                )}
              </div>
              {favoriteMutation.isError && (
                <p role="alert" className="text-xs text-danger">
                  Não foi possível salvar o favorito. Tente de novo.
                </p>
              )}
            </DrawerHeader>

            <Segmented label="Seções" options={TABS} value={tab} onChange={setTab} />

            {/* Rolável e focável: sem vídeo, nada aqui dentro recebe foco, e quem
                usa só o teclado não conseguiria rolar até as instruções. */}
            <div
              role="region"
              aria-label={`Detalhes de ${exercise.name}`}
              tabIndex={0}
              className="mt-3 max-h-[52vh] space-y-4 overflow-y-auto rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tab === 'steps' && <StepsTab exercise={exercise} />}
              {tab === 'muscles' && <MusclesTab exercise={exercise} />}
              {tab === 'history' && <HistoryTab exerciseId={exercise.id} />}

              {/* Por último, discreto, como no app. Fixo no topo, o "editar" era
                  a primeira coisa do detalhe e empurrava para baixo o que a
                  pessoa veio ver — como se faz o exercício. Editar é raro. */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  disabled={clone.isPending}
                  onClick={handleEdit}
                >
                  <Pencil size={14} />
                  {clone.isPending
                    ? 'Criando cópia...'
                    : exercise.source === 'CUSTOM'
                      ? 'Editar exercício'
                      : 'Editar (cria uma cópia sua)'}
                </Button>
              </div>
            </div>

            <DrawerClose asChild>
              <Button variant="ghost" className="mt-4 w-full">
                Fechar
              </Button>
            </DrawerClose>
          </DrawerContent>
        </Drawer>
      )}

      <ExerciseEditDrawer
        exercise={editing}
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </>
  );
}

function details(exercise: Exercise): string {
  return [
    exercise.equipment,
    exercise.level ? (LEVEL_LABEL[exercise.level] ?? exercise.level) : null,
    exercise.mechanic ? (MECHANIC_LABEL[exercise.mechanic] ?? exercise.mechanic) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function StepsTab({ exercise }: { exercise: Exercise }) {
  const guide = exercise.community ?? null;
  const photos = guide?.photos.filter((f) => f.url) ?? [];
  const hasSteps = exercise.instructions && exercise.instructions.length > 0;
  return (
    <>
      {hasSteps ? (
        <ol className="list-none rounded-card bg-card px-4">
          {exercise.instructions.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 border-border py-3.5 text-sm leading-snug text-foreground [&:not(:first-child)]:border-t"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="pt-1">{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Sem passo a passo para este exercício.</p>
      )}
      {guide?.tips && (
        <div className="rounded-card bg-card p-4 text-sm">
          <p className="mb-1 text-xs font-bold text-primary-text">Dica da {guide.groupName}</p>
          <MarkdownLite source={guide.tips} />
        </div>
      )}
      {guide && photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-2" aria-label={`Fotos da ${guide.groupName}`}>
          {photos.map((f, i) => (
            <li key={f.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador */}
              <img
                src={f.url!}
                alt={`${exercise.name}, foto ${i + 1}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MusclesTab({ exercise }: { exercise: Exercise }) {
  const primary = exercise.primaryMuscles ?? [];
  const secondary = exercise.secondaryMuscles ?? [];
  if (primary.length === 0 && secondary.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem músculos cadastrados.</p>;
  }
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <MuscleDiagram primaryMuscles={primary} secondaryMuscles={secondary} sizeClassName="w-24" />
      </div>
      <dl className="min-w-0 space-y-2 text-sm">
        {primary.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold text-muted-foreground">Principal</dt>
            <dd className="text-foreground">{primary.map(muscleLabelPt).join(', ')}</dd>
          </div>
        )}
        {secondary.length > 0 && (
          <div>
            <dt className="text-[11px] font-bold text-muted-foreground">Ajudam</dt>
            <dd className="text-foreground">{secondary.map(muscleLabelPt).join(', ')}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function HistoryTab({ exerciseId }: { exerciseId: number }) {
  const stats = useQuery({
    queryKey: ['workout', 'exercise', exerciseId, 'stats'],
    queryFn: () => workoutApi.getExerciseStats(exerciseId),
  });
  const unit = useUnitPrefs().loadUnit;
  if (stats.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (stats.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        Não foi possível carregar seu histórico.
      </p>
    );
  }
  const data = stats.data;
  if (!data || (!data.record && !data.last)) {
    return <p className="text-sm text-muted-foreground">Você ainda não fez este exercício.</p>;
  }
  const feeling = feelingOf(data.last?.feeling);
  const row = 'flex items-start justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2.5';
  return (
    <ul className="space-y-2">
      {data.record && (
        <li className={row}>
          <div>
            <p className="text-[11px] font-bold text-muted-foreground">Recorde</p>
            <p className="text-base font-extrabold tabular-nums text-foreground">
              {formatBestSet({ ...data.record, avgHeartRate: null }, unit)}
            </p>
          </div>
          {data.record.date && (
            <span className="text-xs text-muted-foreground">{longDate(data.record.date)}</span>
          )}
        </li>
      )}
      {data.last && (
        <li className={row}>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-muted-foreground">Última vez</p>
            <p className="text-sm text-foreground">
              {[
                longDate(data.last.date),
                `${data.last.sets} ${data.last.sets === 1 ? 'série' : 'séries'}`,
                formatBestSet({ ...data.last.best, avgHeartRate: null }, unit),
              ].join(' · ')}
            </p>
          </div>
          {feeling && (
            <span role="img" aria-label={feeling.label} className="text-xl">
              {feeling.emoji}
            </span>
          )}
        </li>
      )}
      {data.estimated1RM != null && (
        <li className={row}>
          <div>
            <p className="text-[11px] font-bold text-muted-foreground">Máximo estimado</p>
            <p className="text-base font-extrabold tabular-nums text-foreground">
              {formatDecimal(kgToLoad(data.estimated1RM, unit), 1)} {loadUnitLabel(unit)}
            </p>
          </div>
        </li>
      )}
    </ul>
  );
}

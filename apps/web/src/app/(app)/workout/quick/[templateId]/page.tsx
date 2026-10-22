'use client';

import { useMemo, useState } from 'react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Play, Clock, Dumbbell, Plus } from 'lucide-react';
import {
  findQuickTemplate,
  isCardioExercise,
  workoutApi,
  type Exercise,
  type QuickTemplate,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { pluralize } from '@/components/workout/format';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
interface LocalExercise {
  localId: string;
  exercise: Exercise;
  targetSets: number;
  targetReps: string;
}

/**
 * Casa cada linha do modelo com o primeiro exercício ainda não usado da busca.
 *
 * Pura, e fora do componente, para poder ser chamada no render — ver o ajuste
 * `if (!resolved && ...)` lá embaixo.
 */
function matchTemplate(
  template: QuickTemplate,
  results: ReadonlyArray<{ data?: Exercise[] }>,
): LocalExercise[] {
  const seen = new Set<number>();
  const matched: LocalExercise[] = [];
  template.exercises.forEach((tmpl, idx) => {
    const match = (results[idx]?.data ?? []).find((e) => !seen.has(e.id));
    if (!match) return;
    seen.add(match.id);
    matched.push({
      localId: `${match.id}-${idx}`,
      exercise: match,
      targetSets: tmpl.targetSets,
      targetReps: tmpl.targetReps,
    });
  });
  return matched;
}

export default function QuickTemplatePage() {
  const { templateId } = useParams<{ templateId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const template = useMemo(() => findQuickTemplate(templateId), [templateId]);
  const [items, setItems] = useState<LocalExercise[]>([]);
  const [nameOverride, setNameOverride] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const lookups = useQueries({
    queries: (template?.exercises ?? []).map((ex) => ({
      queryKey: ['workout', 'exercises', ex.nameQuery],
      queryFn: () => workoutApi.searchExercises(ex.nameQuery),
    })),
  });

  // Ajuste durante o render, e não num efeito (#187). Aqui a trava já era o
  // próprio `resolved`, e não o array de dependências: a resolução acontece uma
  // vez só, quando todas as buscas terminam, e a partir daí a lista é da pessoa —
  // ela adiciona e remove exercícios. Por ser trava booleana não há risco de
  // laço: a primeira passagem põe `resolved` em `true` e nenhuma outra entra.
  // Fazer isso antes de pintar evita o quadro com a lista vazia.
  if (!resolved && template && lookups.every((q) => q.isSuccess || q.isError)) {
    setResolved(true);
    setItems(matchTemplate(template, lookups));
  }

  const start = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Sem exercícios');
      const planName = (nameOverride || template?.title || 'Treino rápido').trim();
      const plan = await workoutApi.createPlan({ name: planName });
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await workoutApi.addPlanExercise(plan.id, {
          exerciseId: it.exercise.id,
          order: i + 1,
          targetSets: it.targetSets,
          targetReps: it.targetReps,
        });
      }
      return workoutApi.startSession({
        planId: plan.id,
        startedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push('/workout');
    },
  });

  useTopBarTitle(nameOverride || template?.title);

  if (!template) {
    return (
      <div className="px-5 pt-4">
        <EmptyState
          title="Template não encontrado"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/workout">Voltar para treinos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const totalSets = items.reduce((acc, i) => acc + i.targetSets, 0);
  const estDuration = Math.max(15, totalSets * 5);
  const estVolume = (totalSets * 1.5).toFixed(1);
  const existingIds = new Set(items.map((i) => i.exercise.id));
  const planName = nameOverride || template.title;

  function updateItem(localId: string, patch: Partial<LocalExercise>) {
    setItems((prev) => prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)));
  }

  function removeItem(localId: string) {
    setItems((prev) => prev.filter((i) => i.localId !== localId));
  }

  function moveItem(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    // A lista é local, então a troca é imediata e o anúncio pode sair junto —
    // não há rede para recusar. Mesmo texto do app e do plano salvo.
    setAnnouncement(
      `${items[idx].exercise.name} movido para a posição ${target + 1} de ${items.length}`,
    );
    setItems((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function handleAdd(exercise: Exercise) {
    setItems((prev) => [
      ...prev,
      {
        localId: `${exercise.id}-${Date.now()}`,
        exercise,
        // Cardio grava uma série só, com duração e distância: "3 × 8-12" numa
        // esteira virava três séries que a sessão nunca pediria. Como no app.
        targetSets: isCardioExercise(exercise) ? 1 : 3,
        targetReps: isCardioExercise(exercise) ? '—' : '8-12',
      },
    ]);
  }

  const loading = !resolved;

  return (
    <div className="pb-4">
      <TopBarActions>
        <button
          type="button"
          onClick={() => setEditingName(true)}
          aria-label="Renomear treino"
          className={topBarActionClass}
        >
          <Pencil size={19} />
        </button>
      </TopBarActions>

      {editingName && (
        <div className="px-5 pt-1 pb-2">
          <Input
            aria-label="Nome do treino"
            autoFocus
            value={nameOverride || template.title}
            onChange={(e) => setNameOverride(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
            }}
            className="h-10 text-base font-bold"
          />
        </div>
      )}

      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-subtle bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${template.gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                TREINO RÁPIDO
              </span>
              <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-extrabold text-white backdrop-blur-sm">
                {template.level.toUpperCase()}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold text-white">{planName}</h2>
              <p className="mt-1 text-xs text-white/70">
                {template.duration} • {template.location}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-subtle px-5 py-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Duração</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {estDuration}m
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dumbbell size={14} className="text-primary" />
              <div>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground">Volume</p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {estVolume} Ton
                </p>
              </div>
            </div>
          </div>
        </div>

        <h3 className="text-base font-extrabold text-foreground">
          Exercícios{' '}
          <span className="text-sm font-bold text-muted-foreground">({items.length})</span>
        </h3>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <EmptyState
            title="Nenhum exercício encontrado para esse template"
            description="Adicione manualmente."
          />
        )}

        {/* Montada sempre: um `aria-live` que nasce preenchido costuma não ser lido. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="space-y-3">
          {items.map((it, idx) => (
            <ExerciseDetailCard
              key={it.localId}
              mode="plan"
              isCardio={isCardioExercise(it.exercise)}
              item={{
                id: it.localId,
                exercise: it.exercise,
                targetSets: it.targetSets,
                targetReps: it.targetReps,
              }}
              isFirst={idx === 0}
              isLast={idx === items.length - 1}
              onChangeSets={(n) => updateItem(it.localId, { targetSets: n })}
              onChangeReps={(v) => updateItem(it.localId, { targetReps: v })}
              onRemove={() => removeItem(it.localId)}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 rounded-2xl"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} />
          Adicionar exercício
        </Button>

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending || items.length === 0}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : 'Iniciar Treino'}
        </Button>

        {start.isError && (
          <p role="alert" className="text-center text-xs text-danger">
            Não foi possível iniciar o treino
            {start.error instanceof Error ? `: ${start.error.message}` : '.'}
          </p>
        )}

        <p className="text-center text-[11px] text-muted-foreground tabular-nums">
          {totalSets} {pluralize(totalSets, 'série planejada', 'séries planejadas')}
        </p>
      </div>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        existingExerciseIds={existingIds}
        onAdd={handleAdd}
      />
    </div>
  );
}

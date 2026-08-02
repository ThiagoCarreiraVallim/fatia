'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, Dumbbell, Lightbulb, Plus, Trash2, Check } from 'lucide-react';
import {
  ApiError,
  isCardioExercise,
  workoutApi,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';

interface MoveVars {
  a: WorkoutPlanExercise;
  b: WorkoutPlanExercise;
}

/**
 * Troca só o campo `order` dos dois vizinhos, e não a posição no array.
 *
 * O cache continua com a mesma forma que a API devolve — quem lê ordena por
 * `order`, como a própria tela faz. Mover os itens de lugar no array deixaria
 * o cache com uma ordenação que nenhuma resposta da API tem.
 */
function swapOrders(a: WorkoutPlanExercise, b: WorkoutPlanExercise) {
  return (e: WorkoutPlanExercise): WorkoutPlanExercise => {
    if (e.id === a.id) return { ...e, order: b.order };
    if (e.id === b.id) return { ...e, order: a.order };
    return e;
  };
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameEdit, setNameEdit] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const plan = useQuery({
    queryKey: ['workout', 'plan', id],
    queryFn: () => workoutApi.getPlan(id),
  });

  const renamePlan = useMutation({
    mutationFn: (name: string) => workoutApi.updatePlan(id, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      setEditingName(false);
    },
  });

  const deletePlan = useMutation({
    mutationFn: () => workoutApi.deletePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      router.push('/workout');
    },
  });

  const updateExercise = useMutation({
    mutationFn: ({
      exerciseId,
      body,
    }: {
      exerciseId: string;
      body: { targetSets?: number; targetReps?: string };
    }) => workoutApi.updatePlanExercise(id, exerciseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  // A troca vai numa requisição só: a API grava os dois `order` dentro de uma
  // transação, então não existe instante em que a lista esteja pela metade.
  const moveExercise = useMutation({
    mutationFn: ({ a, b }: MoveVars) =>
      // O `order` enviado é o do vizinho, nunca o índice: `addPlanExercise` usa
      // `max + 1` e remover exercício não renumera, então a numeração tem
      // buracos (1, 5, 9) que `order: index` corromperia em silêncio.
      workoutApi.reorderPlanExercises(id, [
        { id: a.id, order: b.order },
        { id: b.id, order: a.order },
      ]),
    // O card troca de lugar no toque, não na resposta: no 4G do vestiário a
    // ida e volta some, e quem não vê nada acontecer toca de novo.
    onMutate: async ({ a, b }) => {
      // Sem cancelar, um refetch disparado antes do toque pode responder depois
      // e reescrever o cache com a ordem antiga — o card pula de volta sozinho.
      await qc.cancelQueries({ queryKey: ['workout', 'plan', id] });
      const previous = qc.getQueryData<WorkoutPlan>(['workout', 'plan', id]);
      qc.setQueryData<WorkoutPlan>(['workout', 'plan', id], (old) =>
        old ? { ...old, exercises: old.exercises.map(swapOrders(a, b)) } : old,
      );
      return { previous };
    },
    onSuccess: (updated, { a }) => {
      // A resposta já é o plano reordenado — escrever no cache evita o refetch
      // que só confirmaria o que acabou de chegar.
      qc.setQueryData(['workout', 'plan', id], updated);
      // Posição e total saem da resposta, não da lista que estava na tela no
      // toque: outro aparelho pode ter removido um exercício enquanto isso, e a
      // API aceita a troca do mesmo jeito quando os dois ids do corpo seguem no
      // plano. Contando pelo snapshot do clique, quem depende da região viva
      // ouviria "3 de 3" numa lista de 2.
      const ordenados = [...updated.exercises].sort((x, y) => x.order - y.order);
      const posicao = ordenados.findIndex((e) => e.id === a.id) + 1;
      // O anúncio só sai aqui, como no app nativo: dito no toque, ele afirmaria
      // um movimento que a rede ainda pode recusar. A lista muda embaixo do
      // foco e o rótulo do botão sozinho não conta que a troca aconteceu.
      // `posicao === 0` só sairia de uma resposta que não traz o exercício que
      // ela acabou de mover; aí o honesto é ficar calado.
      setAnnouncement(
        posicao === 0
          ? ''
          : `${a.exercise.name} movido para a posição ${posicao} de ${ordenados.length}`,
      );
    },
    onError: (_error, _vars, context) => {
      // Desfaz o otimismo. O aviso na lista (`role="alert"`) é quem fala da
      // falha; a região viva volta a ficar vazia para não deixar no ar um
      // "movido para a posição 2" que acabou de ser desfeito.
      if (context?.previous) qc.setQueryData(['workout', 'plan', id], context.previous);
      setAnnouncement('');
      // E busca de novo, sempre. O snapshot é do `onMutate` e pode ter
      // envelhecido durante o voo: remover um exercício nesta mesma tela
      // invalida a query, e o refetch responde com a lista já sem ele.
      // Restaurar sem confirmar ressuscitaria na tela o que o servidor apagou.
      // Vale também para o 404 da #205 (id do corpo que saiu do plano em outra
      // aba), onde o cache velho é a própria causa; a mensagem é escolhida no
      // render. O rollback dá o retorno imediato, o refetch dá a verdade.
      void qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const removeExercise = useMutation({
    mutationFn: (exerciseId: string) => workoutApi.removePlanExercise(id, exerciseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
    },
  });

  const start = useMutation({
    mutationFn: () =>
      workoutApi.startSession({
        planId: id,
        startedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push('/workout');
    },
  });

  if (plan.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="h-44 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!plan.data) {
    return <p className="px-5 pt-4 text-sm text-muted-foreground">Plano não encontrado.</p>;
  }

  const exercises = [...plan.data.exercises].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const nextOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.order)) + 1 : 1;
  const totalSets = exercises.reduce((acc, e) => acc + e.targetSets, 0);
  const estDuration = Math.max(15, totalSets * 5);
  const estVolume = (totalSets * 1.5).toFixed(1);

  function startEditName() {
    setNameEdit(plan.data?.name ?? '');
    setEditingName(true);
  }

  function submitName() {
    const trimmed = nameEdit.trim();
    if (trimmed && trimmed !== plan.data?.name) {
      renamePlan.mutate(trimmed);
    } else {
      setEditingName(false);
    }
  }

  function move(idx: number, delta: -1 | 1) {
    // Uma troca por vez, mesmo com o otimismo em pé. O otimismo conserta o que
    // o segundo clique **lê** (a lista já reposicionada), não o que a API
    // **grava**: duas requisições em voo podem chegar em qualquer ordem e
    // compor A=2 e C=2 — dois exercícios com o mesmo `order`. Nada estoura
    // (não há `@@unique([planId, order])`), a lista só passa a ordenar de
    // forma indefinida. A transação garante que cada troca é inteira; não
    // garante que duas trocas concorrentes componham.
    if (moveExercise.isPending) return;
    const target = idx + delta;
    if (target < 0 || target >= exercises.length) return;
    moveExercise.mutate({ a: exercises[idx], b: exercises[target] });
  }

  function handleDelete() {
    if (confirm('Excluir este plano de treino?')) {
      deletePlan.mutate();
    }
  }

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-background/90 px-4 backdrop-blur">
        <Link
          href="/workout"
          aria-label="Voltar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground"
        >
          <ChevronLeft size={20} />
        </Link>
        {editingName ? (
          <div className="flex flex-1 items-center gap-2 px-2">
            <Input
              autoFocus
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="h-8 text-base font-bold"
            />
            <button
              type="button"
              onClick={submitName}
              disabled={!nameEdit.trim() || renamePlan.isPending}
              className="rounded p-1 text-primary disabled:opacity-50"
              aria-label="Salvar nome"
            >
              <Check size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={startEditName}
            className="flex-1 truncate px-2 text-center text-base font-bold text-foreground hover:underline"
          >
            {plan.data.name}
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Excluir plano"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-rose-500"
        >
          <Trash2 size={18} />
        </button>
      </header>

      <div className="space-y-4 px-5 pt-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card">
          <div className="relative h-44 w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-stone-800 to-stone-900" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute left-4 right-4 top-4 flex gap-2">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                HIPERTROFIA
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h2 className="text-2xl font-extrabold text-white">{plan.data.name}</h2>
              <p className="mt-1 text-xs text-white/70">
                {exercises.length} exercício{exercises.length !== 1 ? 's' : ''} • {totalSets} séries
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 border-t border-white/5 px-5 py-3">
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

        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-foreground">
            Exercícios{' '}
            <span className="text-sm font-bold text-muted-foreground">({exercises.length})</span>
          </h3>
        </div>

        {/* Região viva montada sempre, e não junto com o texto: um `aria-live`
            que nasce já preenchido costuma não ser anunciado — a primeira
            troca de todas passaria calada. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {/*
          O PWA não tem toast. O aviso fica na própria lista, que é para onde a
          pessoa está olhando quando o exercício não sai do lugar — e vem do
          estado da mutation, não de um `onError`, porque some sozinho no
          próximo movimento que der certo.
        */}
        {moveExercise.isError && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-400"
          >
            {moveExercise.error instanceof ApiError && moveExercise.error.isNotFound ? (
              // A mensagem crua da API é "Plan exercise not found", em inglês e
              // sem dizer o que fazer. Aqui a causa é sempre a mesma: a lista
              // desta tela está velha.
              <>Este plano mudou em outro lugar. Atualizamos a lista — tente mover de novo.</>
            ) : (
              <>
                Não foi possível mover o exercício
                {moveExercise.error instanceof Error ? `: ${moveExercise.error.message}` : '.'} A
                ordem continua como estava.
              </>
            )}
          </p>
        )}

        {exercises.length === 0 && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-6 text-center text-sm text-muted-foreground hover:bg-primary/10"
          >
            <Plus size={20} className="text-primary" />
            <span>
              Plano criado! Agora{' '}
              <span className="font-bold text-primary">adicione seu primeiro exercício</span>.
            </span>
          </button>
        )}

        <div className="space-y-3">
          {exercises.map((ex, idx) => (
            <ExerciseDetailCard
              key={ex.id}
              mode="plan"
              item={ex}
              isCardio={isCardioExercise(ex.exercise)}
              isFirst={idx === 0}
              isLast={idx === exercises.length - 1}
              isMoving={moveExercise.isPending}
              onChangeSets={(n) =>
                updateExercise.mutate({ exerciseId: ex.id, body: { targetSets: n } })
              }
              onChangeReps={(v) =>
                updateExercise.mutate({ exerciseId: ex.id, body: { targetReps: v } })
              }
              onRemove={() => removeExercise.mutate(ex.id)}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
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

        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Lightbulb size={16} className="text-primary" />
            <h4 className="text-sm font-extrabold text-foreground">Foco na Excêntrica</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Mantenha o controle da descida (fase excêntrica) por 3 segundos para maximizar a
            hipertrofia.
          </p>
        </div>

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending || exercises.length === 0}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : 'Iniciar Treino'}
        </Button>
      </div>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planId={id}
        existingExerciseIds={existingIds}
        nextOrder={nextOrder}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Play, Pencil, Plus, Trash2, Check } from 'lucide-react';
import {
  ApiError,
  planHistoryLine,
  planSummaryLine,
  usersApi,
  workoutApi,
  type PlanExerciseInput,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { PlanExerciseRow } from '@/components/workout/plan-exercise-row';
import { PlanExerciseSheet } from '@/components/workout/plan-exercise-sheet';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/elements/error-state';
import { topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Al-T7: ver por padrão; editar mostra setas, lixeira, renomear e excluir.
  const [editing, setEditing] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkoutPlanExercise | null>(null);
  const { loadUnit } = useUnitPrefs();
  const me = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    staleTime: 5 * 60_000,
  });

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
    mutationFn: ({ exerciseId, body }: { exerciseId: string; body: PlanExerciseInput }) =>
      workoutApi.updatePlanExercise(id, exerciseId, body),
    onSuccess: () => {
      setConfigId(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
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
      setRemoveTarget(null);
      setConfigId(null);
      qc.invalidateQueries({ queryKey: ['workout', 'plan', id] });
      qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
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

  useTopBarTitle(plan.data?.name);

  if (plan.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <Skeleton className="h-6 w-32 rounded bg-muted" />
        <Skeleton className="h-44 rounded-2xl bg-muted" />
        <Skeleton className="h-32 rounded-2xl bg-muted" />
      </div>
    );
  }

  // Falha de rede não é "plano não encontrado" — o app separa os dois casos.
  if (plan.isError) {
    return (
      <div className="px-5 pt-4">
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar o plano"
          detail={plan.error instanceof Error ? plan.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void plan.refetch()}
        />
      </div>
    );
  }

  if (!plan.data) {
    return (
      <div className="px-5 pt-4">
        <EmptyState title="Plano não encontrado" />
      </div>
    );
  }

  const exercises = [...plan.data.exercises].sort((a, b) => a.order - b.order);
  const existingIds = new Set(exercises.map((e) => e.exerciseId));
  const configuring = exercises.find((e) => e.id === configId) ?? null;

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

  return (
    <div className="pb-4">
      {editingName && (
        <div className="flex items-center gap-2 px-5 pt-1 pb-2">
          <Input
            aria-label="Nome do plano"
            autoFocus
            value={nameEdit}
            onChange={(e) => setNameEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitName();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="h-10 text-base font-bold"
          />
          <button
            type="button"
            onClick={submitName}
            disabled={!nameEdit.trim() || renamePlan.isPending}
            className={topBarActionClass}
            aria-label="Salvar nome"
          >
            <Check size={20} />
          </button>
        </div>
      )}

      <div className="space-y-4 px-5 pt-2">
        <section className="rounded-2xl border border-subtle bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {editing ? 'Editando plano' : plan.data.fromTemplateId ? 'modelo' : 'seu plano'}
              </p>
              <h2 className="truncate text-2xl font-extrabold">{plan.data.name}</h2>
              <p className="text-xs text-muted-foreground">
                {planHistoryLine(plan.data.timesDone ?? 0, plan.data.lastDoneAt ?? null)}
              </p>
            </div>
            {/* Na própria tela, e não na barra de topo: é o botão que a
                prancha põe ao lado do nome, e o leitor de tela o acha junto. */}
            <button
              type="button"
              aria-pressed={editing}
              onClick={() => {
                setEditing((e) => !e);
                setEditingName(false);
              }}
              aria-label={editing ? 'Concluir edição' : 'Editar plano'}
              className={
                editing
                  ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground'
                  : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground'
              }
            >
              {editing ? <Check size={20} /> : <Pencil size={18} />}
            </button>
          </div>
          {editing && !editingName && (
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={startEditName}>
                <Pencil size={14} className="mr-1" />
                Renomear
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-danger"
                // O `confirm()` do navegador não diz o que acontece com o
                // histórico, e destoa do resto do PWA; a confirmação diz.
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} className="mr-1" />
                Excluir plano
              </Button>
            </div>
          )}
          <p className="mt-3 text-sm font-semibold">{planSummaryLine(exercises)}</p>
          <PlanMuscleBar exercises={exercises} legend className="mt-2" />
        </section>

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
            className="rounded-2xl border border-rose-500/30 bg-danger/10 px-4 py-3 text-xs text-danger"
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

        <ol className="space-y-2">
          {exercises.map((ex, idx) => (
            <PlanExerciseRow
              key={ex.id}
              item={ex}
              editing={editing}
              isFirst={idx === 0}
              isLast={idx === exercises.length - 1}
              isMoving={moveExercise.isPending}
              onConfigure={() => setConfigId(ex.id)}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              onRemove={() => setRemoveTarget(ex)}
            />
          ))}
        </ol>

        <Button
          variant="outline"
          className="w-full gap-2 rounded-2xl"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} />
          Adicionar exercício
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          {editing
            ? 'Use as setas para mudar a ordem. Toque no exercício para mudar séries, repetições, descanso e técnica.'
            : 'Toque na imagem para ver como fazer. Toque no exercício para mudar séries, repetições e descanso.'}
        </p>

        <Button
          className="h-14 w-full rounded-full text-base font-extrabold shadow-[0_0_24px_hsl(var(--primary)/0.45)]"
          onClick={() => start.mutate()}
          disabled={start.isPending || exercises.length === 0}
        >
          <Play size={16} fill="currentColor" className="mr-1.5" />
          {start.isPending ? 'Iniciando...' : `Iniciar ${plan.data.name}`}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Excluir plano?"
        description="Os treinos já feitos com ele continuam no histórico."
        confirmLabel="Excluir"
        pendingLabel="Excluindo..."
        pending={deletePlan.isPending}
        onConfirm={() => deletePlan.mutate()}
      />

      <ConfirmDialog
        open={removeTarget != null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remover exercício?"
        description={`${removeTarget?.exercise.name ?? ''} sai deste plano. Os treinos já feitos continuam no histórico.`}
        pending={removeExercise.isPending}
        onConfirm={() => removeTarget && removeExercise.mutate(removeTarget.id)}
      />

      <PlanExerciseSheet
        item={configuring}
        open={configuring != null}
        onOpenChange={(open) => {
          if (!open) {
            setConfigId(null);
            updateExercise.reset();
          }
        }}
        loadUnit={loadUnit}
        birthDate={me.data?.birthDate ?? null}
        saving={updateExercise.isPending}
        removing={removeExercise.isPending}
        error={
          updateExercise.isError
            ? `Não foi possível salvar. ${updateExercise.error instanceof Error ? updateExercise.error.message : ''}`
            : null
        }
        onSave={(body) =>
          configuring && updateExercise.mutate({ exerciseId: configuring.id, body })
        }
        onRemove={() => configuring && removeExercise.mutate(configuring.id)}
      />

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planId={id}
        planName={plan.data.name}
        existingExerciseIds={existingIds}
      />
    </div>
  );
}

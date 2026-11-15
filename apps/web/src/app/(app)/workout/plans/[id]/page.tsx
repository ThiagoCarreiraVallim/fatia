'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Play, Pencil, Plus, Check } from 'lucide-react';
import {
  ApiError,
  estimatePlanMinutes,
  planCountsLine,
  planHistoryLine,
  usersApi,
  workoutApi,
  type PlanExerciseInput,
  type WorkoutPlan,
  type WorkoutPlanExercise,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { PlanExerciseRow } from '@/components/workout/plan-exercise-row';
import { PlanExerciseSheet } from '@/components/workout/plan-exercise-sheet';
import { PlanMuscleBar } from '@/components/workout/plan-muscle-bar';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState } from '@/components/elements/error-state';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { headerButtonClass } from '@/components/layout/tab-header';
import { cn } from '@/lib/utils';

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
  const [nameEdit, setNameEdit] = useState('');
  const [announcement, setAnnouncement] = useState('');
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

  // Al-T7: a barra diz o modo ("Plano" / "Editando plano"); o nome vem grande embaixo.
  useTopBarTitle(editing ? 'Editando plano' : 'Plano');

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

  function submitName() {
    const trimmed = nameEdit.trim();
    // Nome vazio volta ao que era, sem gravar.
    if (trimmed && trimmed !== plan.data?.name) renamePlan.mutate(trimmed);
    else setNameEdit(plan.data?.name ?? '');
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

  function toggleEditing() {
    if (editing) {
      submitName();
    } else {
      setNameEdit(plan.data?.name ?? '');
    }
    setEditing((e) => !e);
  }

  const history = planHistoryLine(plan.data.timesDone ?? 0, plan.data.lastDoneAt ?? null);

  return (
    <div className="px-4">
      {/* O lápis e o check ficam na barra de topo, à direita (Al-T7). */}
      <TopBarActions>
        <button
          type="button"
          aria-pressed={editing}
          onClick={toggleEditing}
          aria-label={editing ? 'Concluir edição' : 'Editar plano'}
          className={editing ? headerButtonClass('lime') : topBarActionClass}
        >
          {editing ? <Check size={20} aria-hidden /> : <Pencil size={18} aria-hidden />}
        </button>
      </TopBarActions>

      <DockedPage className="pt-2">
        <div className="space-y-2 px-1">
          {editing ? (
            // Renomear é editar o próprio título: sem botão a mais na tela.
            <input
              aria-label="Nome do plano"
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              onBlur={submitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-full rounded-[14px] bg-card px-3 py-1 font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-foreground outline-none ring-primary focus:ring-2"
            />
          ) : (
            <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.02em]">
              {plan.data.name}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-[22px] items-center rounded-pill px-[9px] text-[11px] font-extrabold uppercase tracking-[0.04em]',
                plan.data.fromTemplateId
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-primary-soft text-primary-text',
              )}
            >
              {plan.data.fromTemplateId ? 'modelo' : 'seu plano'}
            </span>
            <span className="text-xs text-faint">{history}</span>
          </div>
          {renamePlan.isError && (
            <p role="alert" className="text-xs text-danger">
              Não foi possível renomear o plano.
            </p>
          )}
        </div>

        <div className="space-y-2 px-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] text-foreground">{planCountsLine(exercises)}</span>
            <span className="text-xs text-faint tabular-nums">
              ~{estimatePlanMinutes(exercises)} min
            </span>
          </div>
          <PlanMuscleBar exercises={exercises} legend />
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
            className="flex w-full flex-col items-center gap-2 rounded-card border border-dashed border-primary/30 bg-primary/5 p-6 text-center text-sm text-muted-foreground hover:bg-primary/10"
          >
            <Plus size={20} className="text-primary" />
            <span>
              Plano criado! Agora{' '}
              <span className="font-bold text-primary">adicione seu primeiro exercício</span>.
            </span>
          </button>
        )}

        {(exercises.length > 0 || editing) && (
          <div className="rounded-card bg-card px-4">
            <ol>
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
            {editing && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-2 text-sm font-bold text-primary-text',
                  exercises.length > 0 && 'border-t border-border',
                )}
              >
                <Plus size={16} aria-hidden />
                Adicionar exercício
              </button>
            )}
          </div>
        )}

        <p className="px-1 text-xs text-faint">
          {editing
            ? 'Toque no exercício para mudar séries, repetições, descanso e técnica.'
            : 'Toque na imagem para ver como fazer. Toque no lápis para editar séries, ordem e descanso.'}
        </p>

        <DockedAction>
          {editing ? (
            // Cada mudança já grava na hora; este botão fecha a edição, como o check.
            <button
              type="button"
              onClick={toggleEditing}
              className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-foreground text-[15px] font-bold text-background"
            >
              Salvar alterações
            </button>
          ) : (
            <Button
              className="h-14 flex-1 rounded-pill text-[15px] font-bold"
              onClick={() => start.mutate()}
              disabled={start.isPending || exercises.length === 0}
            >
              <Play size={16} aria-hidden />
              {start.isPending ? 'Iniciando...' : `Iniciar ${plan.data.name}`}
            </Button>
          )}
        </DockedAction>
      </DockedPage>

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

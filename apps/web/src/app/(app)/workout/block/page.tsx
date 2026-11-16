'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  BLOCK_WEEK_OPTIONS,
  blockPlannerApi,
  blockWeekRows,
  workoutApi,
  type TrainingBlock,
  type TrainingBlockKind,
} from '@fatia/api-client';
import { ErrorState } from '@/components/elements/error-state';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { errorMessage } from '@/components/nutrition/error-message';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { BlockTimeline } from '@/components/workout/block-timeline';
import { cn } from '@/lib/utils';

type CreateInput = { kind: TrainingBlockKind; weeks: number; planId?: string };

/**
 * Bloco de treino (#379, prancha Al-T12): força ou hipertrofia, de 3 a 6
 * semanas, a última sempre de deload (ADR 019). A prévia vem da API, que é
 * quem sabe o modelo; a tela só desenha. Com bloco em andamento, mostra a
 * semana atual e não oferece outro; concluído, o resumo; interrompido, o
 * "Recomeçar".
 */
export default function BlockPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<TrainingBlockKind>('hypertrophy');
  const [weeks, setWeeks] = useState(4);
  const [planId, setPlanId] = useState('');

  const latest = useQuery({
    queryKey: ['workout', 'block', 'latest'],
    queryFn: () => blockPlannerApi.latest(),
  });
  const active = latest.data?.status === 'active';
  const preview = useQuery({
    queryKey: ['workout', 'block', 'preview', kind, weeks],
    queryFn: () => blockPlannerApi.preview({ weeks, kind }),
    placeholderData: (prev) => prev,
    enabled: latest.isSuccess && !active,
  });
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: latest.isSuccess && !active,
  });

  const create = useMutation({
    mutationFn: (input: CreateInput) => blockPlannerApi.create(input),
    onSuccess: (block) => {
      toast(`Bloco de ${block.weeksTotal} semanas começou`);
      void qc.invalidateQueries({ queryKey: ['workout'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      router.push('/workout');
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError && e.isConflict
          ? 'Já existe um bloco em andamento.'
          : errorMessage(e, { fallback: 'Não deu para começar o bloco. Tente de novo.' }),
      ),
  });

  if (latest.isLoading) {
    return (
      <div className="space-y-4 px-4 pt-2">
        <Skeleton className="h-12 rounded-field bg-muted" />
        <Skeleton className="h-40 rounded-card bg-muted" />
      </div>
    );
  }
  if (latest.isError) {
    return (
      <div className="px-4 pt-2">
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar o bloco"
          detail={latest.error instanceof Error ? latest.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void latest.refetch()}
        />
      </div>
    );
  }

  if (active) {
    return (
      <div className="space-y-3 px-4 pb-8 pt-2">
        <p className="text-sm text-muted-foreground">
          Bloco em andamento. Para montar outro, encerre este primeiro.
        </p>
        <BlockTimeline />
      </div>
    );
  }

  const rows = preview.data ? blockWeekRows(preview.data.weeks) : [];
  const last = latest.data ?? null;

  return (
    <DockedPage className="px-4 pt-2">
      {last && (
        <PastBlockCard
          block={last}
          restarting={create.isPending}
          onRestart={() =>
            create.mutate({
              kind: last.kind,
              weeks: last.weeksTotal,
              ...(last.planId ? { planId: last.planId } : {}),
            })
          }
        />
      )}

      <Segmented<TrainingBlockKind>
        label="Tipo de bloco"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'strength', label: 'Força' },
          { value: 'hypertrophy', label: 'Hipertrofia' },
        ]}
      />

      <div className="flex min-h-16 items-center justify-between gap-3 rounded-card bg-card px-4 py-3">
        <span>
          <b className="block text-[15px]">Semanas</b>
          <span className="block text-xs text-muted-foreground">a última é de deload</span>
        </span>
        <div className="flex gap-1.5">
          {BLOCK_WEEK_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={weeks === n}
              aria-label={`${n} semanas`}
              onClick={() => setWeeks(n)}
              className={cn(
                'anim-press h-9 w-10 rounded-chip text-sm font-bold',
                weeks === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {plans.data && plans.data.length > 0 && (
        <label className="flex min-h-16 items-center justify-between gap-3 rounded-card bg-card px-4 py-3">
          <span className="shrink-0">
            <b className="block text-[15px]">Plano</b>
            <span className="block text-xs text-muted-foreground">o que o bloco periodiza</span>
          </span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="h-10 min-w-0 max-w-[60%] rounded-[12px] bg-muted px-3 text-sm"
          >
            <option value="">Treino livre</option>
            {plans.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {preview.isError && (
        <ErrorState
          className="max-w-none"
          title="Não foi possível montar a prévia"
          detail={preview.error instanceof Error ? preview.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void preview.refetch()}
        />
      )}

      {rows.length > 0 && (
        <>
          <section
            aria-label="Volume e intensidade"
            className="space-y-3.5 rounded-card bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <b className="text-[15px]">Volume e intensidade</b>
              <span className="flex gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-2 w-2 rounded-[2px] bg-primary" />
                  volume
                </span>
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-2 w-2 rounded-[2px] bg-protein" />
                  intensidade
                </span>
              </span>
            </div>
            <div aria-hidden className="flex h-[110px] items-end gap-2.5">
              {rows.map((r) => (
                <div key={r.n} className="flex h-full flex-1 items-end gap-[3px]">
                  <span
                    className="block flex-1 rounded-md bg-primary transition-[height] duration-300"
                    style={{ height: `${Math.round(r.volumeBar * 85)}%` }}
                  />
                  <span
                    className="block flex-1 rounded-md bg-protein transition-[height] duration-300"
                    style={{ height: `${Math.round(r.intensityBar * 95)}%` }}
                  />
                </div>
              ))}
            </div>
          </section>

          <ol
            aria-label="Semanas do bloco"
            className="divide-y divide-border rounded-card bg-card px-4"
          >
            {rows.map((r) => (
              <li key={r.n} className="flex min-h-[60px] items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-extrabold',
                    r.deload
                      ? 'bg-[hsl(var(--water)/0.16)] text-water'
                      : 'bg-primary/15 text-primary',
                  )}
                >
                  {r.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    intensidade {r.intensity} · volume {r.volume}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {r.sessions}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <DockedAction>
        <button
          type="button"
          disabled={create.isPending || !preview.data}
          onClick={() => create.mutate({ kind, weeks, ...(planId ? { planId } : {}) })}
          className="anim-press flex h-14 flex-1 items-center justify-center rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50"
        >
          {create.isPending ? 'Começando...' : `Começar bloco de ${weeks} semanas`}
        </button>
      </DockedAction>
    </DockedPage>
  );
}

/** O último bloco, quando já acabou: o resumo do concluído ou o "Recomeçar" do interrompido. */
function PastBlockCard({
  block,
  restarting,
  onRestart,
}: {
  block: TrainingBlock;
  restarting: boolean;
  onRestart: () => void;
}) {
  const done = block.weeks.reduce((n, w) => n + w.sessionsDone, 0);
  const target = block.weeks.reduce((n, w) => n + w.sessionsTarget, 0);
  if (block.status === 'completed') {
    return (
      <section className="rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]">
        <b className="block text-sm">Bloco de {block.kindLabel} concluído</b>
        <span className="block text-xs text-muted-foreground">
          {done} de {target} sessões em {block.weeksTotal} semanas
        </span>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-3 rounded-card bg-card p-4">
      <span className="min-w-0 flex-1">
        <b className="block text-sm">Bloco de {block.kindLabel} interrompido</b>
        <span className="block text-xs text-muted-foreground">
          {done} de {target} sessões. Dá para recomeçar com as mesmas {block.weeksTotal} semanas.
        </span>
      </span>
      <button
        type="button"
        disabled={restarting}
        onClick={onRestart}
        className="anim-press inline-flex h-[34px] shrink-0 items-center rounded-chip bg-muted px-3.5 text-[13px] font-bold disabled:opacity-50"
      >
        Recomeçar
      </button>
    </section>
  );
}

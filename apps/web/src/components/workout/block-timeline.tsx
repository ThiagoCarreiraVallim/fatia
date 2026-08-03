'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { workoutApi, type TrainingBlock, type TrainingBlockWeek } from '@fatia/api-client';
import { Button } from '@/components/ui/button';

const FOCO_CURTO: Record<TrainingBlockWeek['focus'], string> = {
  accumulation: 'Acúmulo',
  peak: 'Pico',
  deload: 'Deload',
};

/**
 * Onde o usuário está no bloco e o que vem depois (#145).
 *
 * A frase explicativa vem pronta da API (`explanation`): web e mobile mostram a
 * mesma coisa, e a regra de periodização não é reescrita em dois clientes.
 */
export function BlockTimeline({ planId }: { planId?: string }) {
  const qc = useQueryClient();

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });

  const criar = useMutation({
    mutationFn: () => workoutApi.createBlock({ planId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout', 'block'] }),
  });

  const encerrar = useMutation({
    mutationFn: (id: string) => workoutApi.deleteBlock(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout', 'block'] }),
  });

  if (block.isLoading) {
    return <div className="h-28 animate-pulse rounded-2xl bg-muted" data-testid="block-loading" />;
  }

  if (!block.data) {
    return (
      <div className="rounded-2xl border border-white/5 bg-card p-4">
        <p className="text-sm font-bold text-foreground">Periodização em blocos</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Quatro semanas com carga e volume planejados, terminando em deload. Se você perder uma
          semana inteira, o bloco espera por você.
        </p>
        <Button
          className="mt-3 h-10 w-full rounded-xl text-sm font-extrabold"
          onClick={() => criar.mutate()}
          disabled={criar.isPending}
        >
          {criar.isPending ? 'MONTANDO...' : 'MONTAR BLOCO DE 4 SEMANAS'}
        </Button>
      </div>
    );
  }

  return <BlockCard block={block.data} onEncerrar={() => encerrar.mutate(block.data!.id)} />;
}

function BlockCard({ block, onEncerrar }: { block: TrainingBlock; onEncerrar: () => void }) {
  return (
    <section className="rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <CalendarRange size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              Bloco de {block.kindLabel} · {block.repRange} reps
            </p>
            {block.planName && <p className="text-xs text-muted-foreground">{block.planName}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onEncerrar}
          className="text-[11px] font-extrabold text-muted-foreground underline"
        >
          Encerrar
        </button>
      </div>

      <p className="mt-3 text-sm text-foreground">{block.explanation}</p>

      <ol className="mt-3 grid grid-cols-4 gap-2">
        {block.weeks.map((week) => (
          <li key={week.weekNumber} data-testid={`bloco-semana-${week.weekNumber}`}>
            <div
              className={`h-1.5 rounded-full ${
                week.state === 'current' ? 'bg-primary' : barraDoEstado(week.state)
              }`}
            />
            <p
              className={`mt-1 text-[10px] font-bold ${
                week.state === 'current' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              S{week.weekNumber} · {FOCO_CURTO[week.focus]}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {week.sessionsDone}/{week.sessionsTarget}
            </p>
          </li>
        ))}
      </ol>

      {block.nextWeek && (
        <p className="mt-3 text-xs text-muted-foreground">Depois: {block.nextWeek.summary}</p>
      )}
    </section>
  );
}

function barraDoEstado(state: TrainingBlockWeek['state']): string {
  if (state === 'done') return 'bg-primary/60';
  if (state === 'partial') return 'bg-primary/30';
  if (state === 'missed') return 'bg-destructive/50';
  return 'bg-muted';
}

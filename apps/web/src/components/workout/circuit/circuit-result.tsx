import {
  circuitComparisonLabel,
  circuitExercisePace,
  circuitExerciseTotal,
  circuitHeader,
  circuitResultFacts,
  circuitRoundRows,
  feelingOf,
  type CircuitSummary,
} from '@fatia/api-client';
import { ExerciseGroupLine } from '@/components/workout/plan-exercise-row';
import { cn } from '@/lib/utils';

/**
 * O circuito no "Treino feito" (Al-T5) com o desenho do detalhe da sessão de
 * circuito (Al-T11c): a faixa com os números, a comparação com a última vez, o
 * tempo de cada round e o total de cada exercício. O detalhe do histórico
 * (`history/[id]`) passa `feeling` e ganha o terceiro cartão, "como foi".
 */
export function CircuitResultBlocks({
  circuit,
  feeling,
}: {
  circuit: CircuitSummary;
  /** "Como foi o treino" (1 a 5). Sem a prop, o cartão não aparece (o Al-T5 pergunta embaixo). */
  feeling?: number | null;
}) {
  const facts = circuitResultFacts(circuit);
  const comparison = circuitComparisonLabel(circuit);
  const tiles = 1 + (comparison ? 1 : 0) + (feeling !== undefined ? 1 : 0);
  const rows = circuitRoundRows(circuit);
  const longest = Math.max(1, ...rows.map((r) => r.seconds));
  const partial = rows.find((r) => r.partial);

  return (
    <>
      <section
        aria-label="Resultado do circuito"
        className="space-y-2.5 rounded-[24px] bg-steps p-[18px] text-background"
      >
        <p className="text-xs font-extrabold uppercase tracking-[0.06em] opacity-70">
          {circuit.completed ? 'Concluído' : 'Encerrado'} · {circuitHeader(circuit)}
        </p>
        <dl className="grid grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col-reverse gap-0.5">
              <dt className="text-xs font-semibold opacity-70">{f.label}</dt>
              <dd className="font-display text-[26px] font-bold tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Uma coluna por cartão: na primeira vez não há comparação, e a linha não fica com buraco. */}
      <div
        className={cn(
          'grid gap-2',
          tiles === 1 ? 'grid-cols-1' : tiles === 2 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {comparison && (
          <p
            className={cn(
              'flex items-center rounded-[18px] bg-card p-3.5 text-sm font-bold',
              comparison.tone === 'ok' ? 'text-primary-text' : 'text-muted-foreground',
            )}
          >
            {comparison.text}
          </p>
        )}
        <p className="flex flex-col gap-0.5 rounded-[18px] bg-card p-3.5">
          <span className="text-[22px] font-bold tabular-nums">{circuit.totalReps}</span>
          <span className="text-xs text-faint">reps no total</span>
        </p>
        {feeling !== undefined && (
          <p className="flex flex-col gap-0.5 rounded-[18px] bg-card p-3.5">
            <span
              className="text-[22px] font-bold"
              aria-label={feelingOf(feeling)?.label ?? 'sem marca'}
            >
              {feelingOf(feeling)?.emoji ?? '—'}
            </span>
            <span className="text-xs text-faint">como foi</span>
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <section aria-labelledby="circuito-rounds" className="rounded-[20px] bg-card px-4 py-1">
          <h2 id="circuito-rounds" className="pb-1 pt-2.5 font-sans text-xs font-normal text-faint">
            Tempo de cada round
          </h2>
          <ul>
            {rows.map((r, i) => (
              <li
                key={r.label}
                className={cn(
                  'flex min-h-10 items-center gap-2.5',
                  i > 0 && 'border-t border-border',
                )}
              >
                <span className="w-[52px] text-xs text-faint tabular-nums">{r.label}</span>
                <span aria-hidden className="h-2 flex-1 rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full bg-steps"
                    style={{ width: `${(r.seconds / longest) * 100}%` }}
                  />
                </span>
                <span className="w-12 text-right text-sm font-bold tabular-nums">{r.value}</span>
              </li>
            ))}
          </ul>
          {partial && (
            <p className="pb-2.5 pt-2 text-xs text-faint">
              * round incompleto
              {circuit.stoppedAt ? `: o tempo acabou no ${circuit.stoppedAt.name}` : ''}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="circuito-exercicios" className="rounded-[20px] bg-card px-4 py-1">
        <h2
          id="circuito-exercicios"
          className="pb-1 pt-2.5 font-sans text-xs font-normal text-faint"
        >
          Exercícios
        </h2>
        <ul>
          {circuit.exercises.map((e, i) => (
            <li
              key={e.exerciseId}
              className={cn('flex min-h-14 items-center gap-3', i > 0 && 'border-t border-border')}
            >
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block truncate text-sm font-semibold">{e.name}</span>
                <ExerciseGroupLine
                  group={e.muscleGroup}
                  detail={circuitExercisePace(circuit.format, circuit.config, e)}
                />
              </span>
              <span className="text-sm font-bold tabular-nums">{circuitExerciseTotal(e)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

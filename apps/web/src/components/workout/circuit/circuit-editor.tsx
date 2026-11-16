'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Play, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  CIRCUIT_FORMAT_OPTIONS,
  CIRCUIT_STEPS,
  CIRCUIT_UNIT_DEFAULT,
  circuitDraftErrors,
  circuitDraftSummary,
  circuitDraftToInput,
  defaultCircuitName,
  workoutApi,
  type CircuitDraft,
  type CircuitDraftItem,
} from '@fatia/api-client';
import { AddExerciseDrawer } from '@/components/workout/add-exercise-drawer';
import { DockedAction, DockedPage } from '@/components/layout/bottom-nav';
import { ExerciseGroupLine } from '@/components/workout/plan-exercise-row';
import { CircuitStepper } from './circuit-stepper';
import { useStartCircuit } from './use-start-circuit';
import { cn } from '@/lib/utils';

const label = 'px-1 text-xs text-faint';
const row = 'flex min-h-[60px] items-center justify-between gap-3';

/**
 * Novo circuito e editar circuito (prancha Al-T22, #380): nome, os quatro
 * formatos, os campos do formato escolhido, a linha de resumo e os exercícios
 * na ordem, cada um em reps ou tempo. "Salvar" leva para Planos › Circuitos;
 * "Começar agora" salva e abre o relógio.
 */
export function CircuitEditor({ initial, planId }: { initial: CircuitDraft; planId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CircuitDraft>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Salvo uma vez (o "Começar" falhou depois), o próximo toque edita em vez de criar outro.
  const [savedId, setSavedId] = useState<string | null>(planId ?? null);
  const start = useStartCircuit();

  /** Mexer no formato, nos minutos ou nos rounds renomeia enquanto o nome é o automático. */
  const update = (patch: Partial<CircuitDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      return next.nameTouched ? next : { ...next, name: defaultCircuitName(next) };
    });
  const updateItem = (i: number, patch: Partial<CircuitDraftItem>) =>
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)),
    }));

  const errors = circuitDraftErrors(draft);
  const save = useMutation({
    mutationFn: async () => {
      const body = circuitDraftToInput(draft);
      const plan = savedId
        ? await workoutApi.updateCircuit(savedId, body)
        : await workoutApi.createCircuit(body);
      setSavedId(plan.id);
      return plan;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
    },
  });

  const submit = async (then: 'list' | 'start') => {
    setShowErrors(true);
    if (errors.length > 0 || save.isPending || start.isPending) return;
    const plan = await save.mutateAsync().catch(() => null);
    if (!plan) return;
    if (then === 'start') {
      start.mutate(plan.id);
      return;
    }
    toast.success('Salvo em Planos › Circuitos');
    router.push('/workout/plans?tab=circuitos');
  };

  const isTime = draft.format === 'AMRAP' || draft.format === 'EMOM';
  const busy = save.isPending || start.isPending;
  const failure = save.error ?? start.error;

  return (
    <DockedPage className="px-4 pt-2">
      <div className="space-y-2">
        <label htmlFor="circuit-name" className={cn(label, 'block')}>
          Nome
        </label>
        <input
          id="circuit-name"
          value={draft.name}
          maxLength={80}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, nameTouched: true }))}
          className="h-[52px] w-full rounded-2xl bg-card px-4 text-[17px] font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <p id="circuit-format" className={label}>
          Formato
        </p>
        <div role="radiogroup" aria-labelledby="circuit-format" className="grid grid-cols-2 gap-2">
          {CIRCUIT_FORMAT_OPTIONS.map((o) => {
            const on = draft.format === o.format;
            return (
              <button
                key={o.format}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update({ format: o.format })}
                className={cn(
                  'anim-press flex min-h-[84px] flex-col items-start gap-1 rounded-[18px] p-3.5 text-left',
                  on ? 'bg-primary-soft shadow-[inset_0_0_0_2px_hsl(var(--primary))]' : 'bg-card',
                )}
              >
                <span className="text-base font-bold text-foreground">{o.title}</span>
                <span className="text-xs text-faint">{o.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[20px] bg-card px-4">
        {isTime && (
          <div className={row}>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold">Duração</span>
              <span className="block text-xs text-faint">
                {draft.format === 'AMRAP' ? 'faça o máximo de rounds' : 'troca a cada minuto'}
              </span>
            </span>
            <CircuitStepper
              label="duração"
              suffix="min"
              value={draft.minutes}
              onChange={(minutes) => update({ minutes })}
              {...CIRCUIT_STEPS.minutes}
            />
          </div>
        )}
        {draft.format === 'TABATA' && (
          <>
            <div className={row}>
              <span className="text-[15px] font-bold">Trabalho</span>
              <CircuitStepper
                label="trabalho"
                suffix="s"
                value={draft.workSeconds}
                onChange={(workSeconds) => update({ workSeconds })}
                {...CIRCUIT_STEPS.workSeconds}
              />
            </div>
            <div className={cn(row, 'border-t border-border')}>
              <span className="text-[15px] font-bold">Descanso</span>
              <CircuitStepper
                label="descanso"
                suffix="s"
                value={draft.restSeconds}
                onChange={(restSeconds) => update({ restSeconds })}
                {...CIRCUIT_STEPS.restSeconds}
              />
            </div>
            <div className={cn(row, 'border-t border-border')}>
              <span className="text-[15px] font-bold">Intervalos</span>
              <CircuitStepper
                label="intervalos"
                value={draft.intervals}
                onChange={(intervals) => update({ intervals })}
                {...CIRCUIT_STEPS.intervals}
              />
            </div>
          </>
        )}
        {draft.format === 'FOR_TIME' && (
          <>
            <div className={row}>
              <span className="text-[15px] font-bold">Rounds</span>
              <CircuitStepper
                label="rounds"
                value={draft.rounds}
                onChange={(rounds) => update({ rounds })}
                {...CIRCUIT_STEPS.rounds}
              />
            </div>
            <div className={cn(row, 'border-t border-border')}>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">Descanso</span>
                <span className="block text-xs text-faint">entre rounds</span>
              </span>
              <CircuitStepper
                label="descanso entre rounds"
                suffix="s"
                value={draft.restBetweenRounds}
                onChange={(restBetweenRounds) => update({ restBetweenRounds })}
                {...CIRCUIT_STEPS.restBetweenRounds}
              />
            </div>
          </>
        )}
      </div>

      <p className={label}>{circuitDraftSummary(draft)}</p>

      <section aria-labelledby="circuit-exercises" className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="circuit-exercises" className="text-xs font-normal text-faint">
            Exercícios
          </h2>
          <span className="text-xs text-faint">na ordem do circuito</span>
        </div>
        <div className="rounded-[20px] bg-card px-4">
          {draft.exercises.length > 0 && (
            <ol>
              {draft.exercises.map((e, i) => {
                const steps = e.unit === 'REPS' ? CIRCUIT_STEPS.reps : CIRCUIT_STEPS.seconds;
                return (
                  <li
                    key={`${e.exerciseId}-${i}`}
                    className={cn('space-y-2.5 py-3', i > 0 && 'border-t border-border')}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-xs font-extrabold"
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block truncate text-[15px] font-semibold">{e.name}</span>
                        <ExerciseGroupLine group={e.muscleGroup} />
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover ${e.name}`}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            exercises: d.exercises.filter((_, k) => k !== i),
                          }))
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:text-danger"
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 pl-[38px]">
                      <div
                        role="radiogroup"
                        aria-label={`Medida de ${e.name}`}
                        className="flex gap-[3px] rounded-[12px] bg-muted p-[3px]"
                      >
                        {(['REPS', 'SECONDS'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            role="radio"
                            aria-checked={e.unit === unit}
                            onClick={() =>
                              e.unit !== unit &&
                              updateItem(i, { unit, target: CIRCUIT_UNIT_DEFAULT[unit] })
                            }
                            className={cn(
                              'h-8 rounded-[9px] px-3 text-[13px] font-bold',
                              e.unit === unit
                                ? 'bg-foreground text-background'
                                : 'text-muted-foreground',
                            )}
                          >
                            {unit === 'REPS' ? 'reps' : 'tempo'}
                          </button>
                        ))}
                      </div>
                      <CircuitStepper
                        label={e.name}
                        suffix={e.unit === 'REPS' ? 'reps' : 's'}
                        value={e.target}
                        onChange={(target) => updateItem(i, { target })}
                        {...steps}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(
              'flex min-h-[52px] w-full items-center gap-2 text-sm font-bold text-primary-text',
              draft.exercises.length > 0 && 'border-t border-border',
            )}
          >
            <Plus size={16} aria-hidden />
            Adicionar exercício
          </button>
        </div>
      </section>

      {showErrors && errors.length > 0 && (
        <ul role="alert" className="space-y-1 px-1 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {failure && !(showErrors && errors.length > 0) && (
        <p role="alert" className="px-1 text-sm text-danger">
          Não foi possível salvar o circuito.{' '}
          {failure instanceof Error ? failure.message : 'Tente de novo.'}
        </p>
      )}

      <DockedAction>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('list')}
          className="anim-press flex h-14 shrink-0 items-center justify-center rounded-pill bg-muted px-5 text-[15px] font-bold text-foreground disabled:opacity-60"
        >
          {save.isPending && !start.isPending ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('start')}
          className="anim-press flex h-14 flex-1 items-center justify-center gap-2 rounded-pill bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-60"
        >
          <Play size={16} aria-hidden />
          {start.isPending ? 'Começando...' : 'Começar agora'}
        </button>
      </DockedAction>

      <AddExerciseDrawer
        open={addOpen}
        onOpenChange={setAddOpen}
        planName={draft.name.trim() || undefined}
        existingExerciseIds={new Set(draft.exercises.map((e) => e.exerciseId))}
        onAddMany={(chosen) =>
          setDraft((d) => ({
            ...d,
            exercises: [
              ...d.exercises,
              ...chosen.map((x) => ({
                exerciseId: x.id,
                name: x.name,
                muscleGroup: x.muscleGroup,
                unit: 'REPS' as const,
                target: CIRCUIT_UNIT_DEFAULT.REPS,
              })),
            ],
          }))
        }
      />
    </DockedPage>
  );
}

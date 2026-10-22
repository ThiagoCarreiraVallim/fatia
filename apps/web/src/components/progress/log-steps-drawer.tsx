'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  dayLabel,
  progressApi,
  undoMessage,
  stepsRestoreInput,
  type StepLog,
} from '@fatia/api-client';
import { useUndoSlot } from './use-undo-slot';
import { hojeIso } from '@/lib/dias';
import { LogDayField } from './log-day-field';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { dayMonth, formatInteger } from './log-format';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Dia em que o drawer abre; sem ele, hoje. */
  date?: string;
}

const HISTORY_DAYS = 30;

export function LogStepsDrawer({ open, onClose, date }: Props) {
  const today = hojeIso();
  const [day, setDay] = useState(date ?? today);
  const [steps, setSteps] = useState('');
  const [editing, setEditing] = useState<StepLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const logs = useQuery({
    queryKey: ['step-logs', HISTORY_DAYS],
    queryFn: () =>
      progressApi.listSteps({
        from: new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
      }),
    // Ver `log-weight-drawer`: o card de passos do dashboard monta este drawer
    // fechado, e sem isto buscaria o histórico em toda visita.
    enabled: open,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['progress', 'steps'] });
    qc.invalidateQueries({ queryKey: ['step-logs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    // A meta de passos é derivada da média de `steps.getHistory(7)`
    // (`goals.service.ts`), então editar ou apagar também a move.
    qc.invalidateQueries({ queryKey: ['goals'] });
  }

  function clearForm() {
    setSteps('');
    setEditing(null);
    setFormError(null);
  }

  function resetAll() {
    setUndone(null);
    restore.reset();
    clearForm();
    setDay(date ?? hojeIso());
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ value, id }: { value: number; id: string | null }) =>
      // `updateStep` nem aceita `date` na assinatura do api-client, e o service
      // só escreve o campo quando ele vem — corrigir a contagem de anteontem
      // não move o registro para hoje.
      id
        ? progressApi.updateStep(id, { steps: value })
        : progressApi.createStep({ steps: value, ...(day !== today ? { date: day } : {}) }),
    onSuccess: (_data, variables) => {
      invalidate();
      clearForm();
      if (!variables.id) {
        setDay(date ?? hojeIso());
        onClose();
      }
    },
  });

  // Apaga sem perguntar; o aviso oferece "Desfazer" (`undo.ts` do api-client).
  const restore = useMutation({
    mutationFn: (log: StepLog) => progressApi.createStep(stepsRestoreInput(log)),
    onSuccess: () => invalidate(),
  });
  const [undone, setUndone] = useUndoSlot<StepLog>();

  const remove = useMutation({
    mutationFn: (log: StepLog) => progressApi.deleteStep(log.id),
    onSuccess: (_data, log) => {
      invalidate();
      setUndone(log);
      if (editing?.id === log.id) clearForm();
      inputRef.current?.focus();
    },
  });

  function submit() {
    const raw = steps.trim();
    const value = Number(raw);
    // `raw` vazio antes de tudo: `Number('')` é `0`, e `0 < 0` é falso — sem
    // esta guarda o campo em branco viraria um registro de 0 passos. No caminho
    // de edição isso zerava o registro em silêncio, e como o servidor usa o
    // MAX do dia (ADR 007) o card "Passos hoje" desabava junto. Zero digitado
    // de propósito continua valendo: é um dia sem caminhada, e a API aceita.
    if (!raw || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      setFormError('Valor inválido');
      return;
    }
    setFormError(null);
    save.mutate({ value, id: editing?.id ?? null });
  }

  const entries: LogHistoryEntry[] = (logs.data?.logs ?? []).map((log) => ({
    id: log.id,
    title: `${formatInteger(log.steps)} passos`,
    subtitle: dayMonth(log.date),
  }));

  const error = formError ?? (save.error as Error | null)?.message ?? null;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        resetAll();
        onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>{editing ? 'Editar passos' : 'Logar passos'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo o registro de ${dayMonth(editing.date)}.`
              : 'Múltiplos logs no mesmo dia são OK — o servidor pega o maior valor.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          {/* Editar nunca muda o dia (ver `save`): o campo é só de registro novo. */}
          {!editing && <LogDayField id="steps-day" day={day} today={today} onChange={setDay} />}
          <div className="space-y-1">
            <label htmlFor="steps" className="text-sm font-medium">
              Passos
            </label>
            <Input
              id="steps"
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder="ex: 9500"
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {remove.error && <p className="text-sm text-danger">{(remove.error as Error).message}</p>}
          {restore.error && (
            <p className="text-sm text-danger">Não deu para desfazer. Registre de novo.</p>
          )}

          <LogHistory
            entries={entries}
            isLoading={logs.isLoading}
            isError={logs.isError}
            onRetry={() => void logs.refetch()}
            editingId={editing?.id ?? null}
            onEdit={(entry) => {
              const log = logs.data?.logs.find((item) => item.id === entry.id);
              if (!log) return;
              setEditing(log);
              setSteps(String(log.steps));
              setFormError(null);
              // Ver `log-weight-drawer`: erro antigo não pode acusar linha nova.
              save.reset();
              remove.reset();
              inputRef.current?.focus();
            }}
            onDelete={(entry) => {
              const log = logs.data?.logs.find((item) => item.id === entry.id);
              if (log) remove.mutate(log);
            }}
            pendingId={remove.isPending ? (remove.variables?.id ?? null) : null}
            isDeleting={remove.isPending}
            undo={
              undone
                ? {
                    message: undoMessage('steps'),
                    onUndo: () => {
                      restore.mutate(undone);
                      setUndone(null);
                    },
                  }
                : null
            }
            emptyLabel="Nenhum registro de passos nos últimos 30 dias."
          />

          <div className="space-y-2">
            <Button className="w-full" onClick={submit} disabled={save.isPending || !steps.trim()}>
              {save.isPending
                ? 'Salvando…'
                : editing
                  ? 'Salvar alteração'
                  : day === today
                    ? 'Salvar'
                    : `Salvar em ${dayLabel(day, today)}`}
            </Button>
            {editing && (
              <Button variant="outline" className="w-full" onClick={resetAll}>
                Cancelar edição
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

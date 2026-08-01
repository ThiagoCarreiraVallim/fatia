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
import { progressApi, type StepLog } from '@fatia/api-client';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { dayMonth, formatInteger } from './log-format';

interface Props {
  open: boolean;
  onClose: () => void;
  date?: string;
}

const HISTORY_DAYS = 30;

export function LogStepsDrawer({ open, onClose, date }: Props) {
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
  }

  function clearForm() {
    setSteps('');
    setEditing(null);
    setFormError(null);
  }

  function resetAll() {
    clearForm();
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
        : progressApi.createStep({ steps: value, ...(date ? { date } : {}) }),
    onSuccess: (_data, variables) => {
      invalidate();
      clearForm();
      if (!variables.id) onClose();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => progressApi.deleteStep(id),
    onSuccess: (_data, id) => {
      invalidate();
      if (editing?.id === id) clearForm();
      inputRef.current?.focus();
    },
  });

  function submit() {
    const value = Number(steps);
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
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

          {error && <p className="text-sm text-rose-500">{error}</p>}
          {remove.error && (
            <p className="text-sm text-rose-500">{(remove.error as Error).message}</p>
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
              inputRef.current?.focus();
            }}
            onDelete={(entry) => remove.mutate(entry.id)}
            pendingId={remove.isPending ? (remove.variables ?? null) : null}
            emptyLabel="Nenhum registro de passos nos últimos 30 dias."
            confirmLabel="Apagar este registro de passos?"
          />

          <div className="space-y-2">
            <Button className="w-full" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : editing ? 'Salvar alteração' : 'Salvar'}
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

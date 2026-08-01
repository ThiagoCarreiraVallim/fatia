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
import { progressApi, type WeightLog } from '@fatia/api-client';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { dayMonth, formatDecimal } from './log-format';

interface Props {
  open: boolean;
  onClose: () => void;
}

const HISTORY_DAYS = 30;

export function LogWeightDrawer({ open, onClose }: Props) {
  const [weight, setWeight] = useState('');
  const [editing, setEditing] = useState<WeightLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const logs = useQuery({
    queryKey: ['weight-logs', HISTORY_DAYS],
    // A janela é calculada na hora de buscar, e não no render: um drawer aberto
    // à meia-noite continua pedindo os últimos 30 dias, não os 30 de ontem.
    queryFn: () =>
      progressApi.listWeights({
        from: new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
      }),
    // Sem `enabled`, toda página que monta o drawer fechado — o dashboard entre
    // elas — buscaria 30 dias de histórico já no primeiro render.
    enabled: open,
  });

  function invalidate() {
    // As três chaves, sempre. `['progress','weight']` alimenta o gráfico e
    // `['dashboard']` alimenta o card do topo: invalidar só uma faz o gráfico
    // corrigir e o número do dashboard continuar errado até o reload.
    qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
    qc.invalidateQueries({ queryKey: ['weight-logs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function clearForm() {
    setWeight('');
    setEditing(null);
    setFormError(null);
  }

  /** Sai da edição e apaga também o erro da tentativa anterior. */
  function resetAll() {
    clearForm();
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ weightKg, id }: { weightKg: number; id: string | null }) =>
      // `updateWeight` não manda `loggedAt`, e o service só escreve a data
      // quando ela vem no payload (spread condicional em
      // `weight-log.service.ts`). Corrigir o número preserva o dia da pesagem.
      id ? progressApi.updateWeight(id, { weightKg }) : progressApi.createWeight({ weightKg }),
    onSuccess: (_data, variables) => {
      invalidate();
      clearForm();
      // Criar fecha o drawer, como sempre foi. Editar mantém aberto: a lista
      // logo abaixo é a confirmação de que a correção pegou.
      if (!variables.id) onClose();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => progressApi.deleteWeight(id),
    onSuccess: (_data, id) => {
      invalidate();
      if (editing?.id === id) clearForm();
      // A linha apagada sai do DOM levando o foco junto; sem isto a navegação
      // por teclado recomeçaria do `<body>`.
      inputRef.current?.focus();
    },
  });

  function submit() {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Peso inválido');
      return;
    }
    setFormError(null);
    save.mutate({ weightKg: value, id: editing?.id ?? null });
  }

  const entries: LogHistoryEntry[] = (logs.data?.logs ?? []).map((log) => ({
    id: log.id,
    title: `${formatDecimal(log.weightKg)} kg`,
    subtitle: dayMonth(log.loggedAt),
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
          <DrawerTitle>{editing ? 'Editar peso' : 'Logar peso'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo a pesagem de ${dayMonth(editing.loggedAt)}.`
              : 'Pesagem da manhã, em jejum, é o mais consistente.'}
          </DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          <div className="space-y-1">
            <label htmlFor="weight-kg" className="text-sm font-medium">
              Peso (kg)
            </label>
            <Input
              id="weight-kg"
              ref={inputRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="ex: 78.5"
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
              setWeight(String(log.weightKg));
              setFormError(null);
              inputRef.current?.focus();
            }}
            onDelete={(entry) => remove.mutate(entry.id)}
            pendingId={remove.isPending ? (remove.variables ?? null) : null}
            emptyLabel="Nenhuma pesagem nos últimos 30 dias."
            confirmLabel="Apagar esta pesagem?"
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

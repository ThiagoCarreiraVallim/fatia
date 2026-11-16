'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import {
  dayLabel,
  progressApi,
  undoMessage,
  weightRestoreInput,
  type WeightLog,
} from '@fatia/api-client';
import { useUndoSlot } from './use-undo-slot';
import { hojeIso, instanteNoDia } from '@/lib/dias';
import { LogDayField } from './log-day-field';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { formatDecimal, hourMinute, instantDayMonth } from './log-format';
import { ValueStepper } from './value-stepper';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Dia em que o drawer abre; sem ele, hoje. */
  date?: string;
  /** Só o miolo, sem a gaveta: a folha Peso/Passos (Al-G7) é quem abre e fecha. */
  embedded?: boolean;
  /** O segmentado Peso · Passos da folha, no topo. */
  switcher?: ReactNode;
}

const HISTORY_DAYS = 30;

export function LogWeightDrawer({ open, onClose, date, embedded = false, switcher }: Props) {
  const today = hojeIso();
  const [day, setDay] = useState(date ?? today);
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
    enabled: open || embedded,
  });

  function invalidate() {
    // Todos os consumidores, sempre. `['progress','weight']` alimenta o
    // gráfico, `['dashboard']` alimenta o card do topo e `['goals']` alimenta o
    // progresso da meta de peso, que o servidor deriva de `weights.getLatest()`
    // (`goals.service.ts`). Invalidar só uma faz o gráfico corrigir e os outros
    // números continuarem errados até o reload.
    qc.invalidateQueries({ queryKey: ['progress', 'weight'] });
    qc.invalidateQueries({ queryKey: ['weight-logs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['goals'] });
  }

  function clearForm() {
    setWeight('');
    setEditing(null);
    setFormError(null);
  }

  /** Sai da edição e apaga também o erro da tentativa anterior. */
  function resetAll() {
    setUndone(null);
    restore.reset();
    clearForm();
    setDay(date ?? hojeIso());
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ weightKg, id }: { weightKg: number; id: string | null }) =>
      // `updateWeight` não manda `loggedAt`, e o service só escreve a data
      // quando ela vem no payload (spread condicional em
      // `weight-log.service.ts`). Corrigir o número preserva o dia da pesagem.
      // Em dia passado vai meio-dia local (`instanteNoDia`); hoje, o servidor usa agora.
      id
        ? progressApi.updateWeight(id, { weightKg })
        : progressApi.createWeight({
            weightKg,
            ...(day !== today ? { loggedAt: instanteNoDia(day) } : {}),
          }),
    onSuccess: (_data, variables) => {
      invalidate();
      clearForm();
      // Criar fecha o drawer, como sempre foi. Editar mantém aberto: a lista
      // logo abaixo é a confirmação de que a correção pegou.
      if (!variables.id) {
        setDay(date ?? hojeIso());
        onClose();
      }
    },
  });

  // Apaga sem perguntar; o aviso oferece "Desfazer" (`undo.ts` do api-client).
  const restore = useMutation({
    mutationFn: (log: WeightLog) => progressApi.createWeight(weightRestoreInput(log)),
    onSuccess: () => invalidate(),
  });
  const [undone, setUndone] = useUndoSlot<WeightLog>();

  const remove = useMutation({
    mutationFn: (log: WeightLog) => progressApi.deleteWeight(log.id),
    onSuccess: (_data, log) => {
      invalidate();
      setUndone(log);
      if (editing?.id === log.id) clearForm();
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
    subtitle: instantDayMonth(log.loggedAt),
    time: hourMinute(log.loggedAt),
    // Peso só entra à mão por enquanto (a balança conectada não chegou).
    badge: { label: 'manual', tone: 'mute' },
  }));

  const error = formError ?? (save.error as Error | null)?.message ?? null;

  const content = (
    <>
      {switcher}

      <DrawerHeader className="px-0">
        <DrawerTitle>{editing ? 'Editar peso' : 'Registrar peso'}</DrawerTitle>
        <DrawerDescription>
          {editing
            ? `Corrigindo a pesagem de ${instantDayMonth(editing.loggedAt)}.`
            : day === today
              ? 'Pesagem de hoje.'
              : `A pesagem vai para ${dayLabel(day, today)}.`}
        </DrawerDescription>
      </DrawerHeader>
      <div className="my-3 space-y-4">
        {/* Editar nunca muda o dia (ver `save`): o campo é só de registro novo. */}
        {!editing && <LogDayField id="weight-day" day={day} today={today} onChange={setDay} />}
        <ValueStepper
          id="weight-kg"
          ref={inputRef}
          label="Peso (kg)"
          value={weight}
          onChange={setWeight}
          step={0.1}
          decimals={1}
          base={logs.data?.logs[0]?.weightKg ?? null}
          unit="kg"
          placeholder="0,0"
        />
        <p className="text-center text-[13px] text-muted-foreground">
          De manhã, em jejum, é o mais consistente.
        </p>

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
            setWeight(String(log.weightKg));
            setFormError(null);
            // Sem o `reset`, o erro da tentativa anterior fica colado na tela
            // e passa a acusar uma linha que nunca falhou.
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
                  message: undoMessage('weight'),
                  onUndo: () => {
                    restore.mutate(undone);
                    setUndone(null);
                  },
                }
              : null
          }
          emptyLabel="Nenhuma pesagem nos últimos 30 dias."
        />

        <div className="space-y-2">
          <Button className="w-full" onClick={submit} disabled={save.isPending}>
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
    </>
  );

  if (embedded) return content;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        resetAll();
        onClose();
      }}
    >
      <DrawerContent className="px-4 pb-6">{content}</DrawerContent>
    </Drawer>
  );
}

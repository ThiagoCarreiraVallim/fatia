import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clockTime,
  dayLabel,
  progressApi,
  undoMessage,
  stepSourceBadge,
  stepsRestoreInput,
  type StepLog,
} from '@fatia/api-client';
import { hojeIso } from '@/components/nutrition/helpers';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormMessage,
} from '@/components/ui';
import { dayMonth, formatInteger } from '@/components/charts';
import { useToast } from '@/components/ui/toast';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { SeletorDeDia } from './seletor-de-dia';
import { ValueStepper } from './value-stepper';
import { Text } from '@/components/ui/text';
import { parseAmount } from './parse';

const HISTORY_DAYS = 30;

/**
 * Réplica de `apps/web/src/components/progress/log-steps-drawer.tsx`, com edição
 * e remoção — ver `log-history.tsx`.
 */
export function LogStepsDrawer({
  open,
  onClose,
  date,
  embedded = false,
  switcher,
}: {
  open: boolean;
  onClose: () => void;
  /** Dia em que o drawer abre; sem ele, hoje. */
  date?: string;
  /** Só o miolo, sem a gaveta: a folha Peso/Passos (Al-G7) é quem abre e fecha. */
  embedded?: boolean;
  /** O segmentado Peso · Passos da folha, no topo. */
  switcher?: ReactNode;
}) {
  const hoje = hojeIso();
  const [dia, setDia] = useState(date ?? hoje);
  const [steps, setSteps] = useState('');
  const [editing, setEditing] = useState<StepLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  // `useState` com inicializador preguiçoso, e não `useMemo(..., [])`: `useMemo`
  // é dica de performance, não garantia — o React pode descartar o valor e
  // recalcular. Aqui isso viraria uma data nova, chave de query nova e refetch.
  // O inicializador roda uma vez por montagem, que é a semântica que se quer.
  const [from] = useState(() =>
    new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
  );

  const logs = useQuery({
    queryKey: ['step-logs', from],
    queryFn: () => progressApi.listSteps({ from }),
    enabled: open || embedded,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['progress', 'steps'] });
    queryClient.invalidateQueries({ queryKey: ['step-logs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function reset() {
    setDia(date ?? hojeIso());
    setSteps('');
    setEditing(null);
    setFormError(null);
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ value, id }: { value: number; id: string | null }) =>
      id
        ? progressApi.updateStep(id, { steps: value })
        : progressApi.createStep({ steps: value, ...(dia !== hoje ? { date: dia } : {}) }),
    onSuccess: (_result, variables) => {
      invalidate();
      setSteps('');
      setEditing(null);
      if (!variables.id) {
        setDia(date ?? hojeIso());
        onClose();
      }
    },
  });

  // Apaga sem perguntar; o aviso oferece "Desfazer" (`undo.ts` do api-client).
  const restore = useMutation({
    mutationFn: (log: StepLog) => progressApi.createStep(stepsRestoreInput(log)),
    onSuccess: invalidate,
    onError: () => toast.show({ message: 'Não deu para desfazer. Registre de novo.' }),
  });

  const remove = useMutation({
    mutationFn: (log: StepLog) => progressApi.deleteStep(log.id),
    onSuccess: (_result, log) => {
      invalidate();
      toast.show({
        message: undoMessage('steps'),
        action: { label: 'Desfazer', onPress: () => restore.mutate(log) },
      });
      if (editing?.id === log.id) {
        setEditing(null);
        setSteps('');
      }
    },
  });

  function submit() {
    const value = parseAmount(steps);
    if (value === null || value < 0 || !Number.isInteger(value)) {
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
    time: clockTime(log.loggedAt),
    badge: stepSourceBadge(log.source),
    readOnly: !stepSourceBadge(log.source).manual,
  }));

  const error = formError ?? (save.error as Error | null)?.message ?? null;

  const content = (
    <>
        {switcher}

        <DrawerHeader className="px-0">
          <DrawerTitle>{editing ? 'Editar passos' : 'Registrar passos'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo o registro de ${dayMonth(editing.date)}.`
              : 'Passos do dia.'}
          </DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 py-3">
          {editing ? null : <SeletorDeDia dia={dia} hoje={hoje} onChange={setDia} />}
          <ValueStepper
            label="Passos"
            value={steps}
            onChange={setSteps}
            step={500}
            decimals={0}
            base={logs.data?.logs[0]?.steps ?? null}
            unit="passos"
            placeholder="0"
          />
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Text className="text-center text-[13px] text-muted-foreground">
            Vários registros no dia: vale o maior. Os do celular chegam sozinhos.
          </Text>

          {remove.error ? <FormMessage>{(remove.error as Error).message}</FormMessage> : null}

          <LogHistory
            entries={entries}
            isLoading={logs.isLoading}
            error={logs.error}
            onRetry={() => logs.refetch()}
            editingId={editing?.id ?? null}
            onEdit={(entry) => {
              const log = logs.data?.logs.find((item) => item.id === entry.id);
              if (!log) return;
              setEditing(log);
              setSteps(String(log.steps));
              setFormError(null);
            }}
            onDelete={(entry) => {
              const log = logs.data?.logs.find((item) => item.id === entry.id);
              if (log) remove.mutate(log);
            }}
            pendingId={remove.isPending ? (remove.variables?.id ?? null) : null}
            emptyLabel="Nenhum registro de passos nos últimos 30 dias."
          />
        </View>

        <DrawerFooter className="px-0">
          <Button onPress={submit} loading={save.isPending}>
            {editing
              ? 'Salvar alteração'
              : dia === hoje
                ? 'Salvar'
                : `Salvar em ${dayLabel(dia, hoje)}`}
          </Button>
          {editing ? (
            <Button
              variant="outline"
              onPress={() => {
                setEditing(null);
                setSteps('');
                setFormError(null);
              }}
            >
              Cancelar edição
            </Button>
          ) : null}
        </DrawerFooter>
    </>
  );

  if (embedded) return content;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DrawerContent className="px-4">
        {content}
      </DrawerContent>
    </Drawer>
  );
}

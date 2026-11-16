import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clockTime,
  dayLabel,
  progressApi,
  undoMessage,
  weightRestoreInput,
  type WeightLog,
} from '@fatia/api-client';
import { hojeIso, instanteNoDia } from '@/components/nutrition/helpers';
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
import { formatDecimal, instantDayMonth } from '@/components/charts';
import { useToast } from '@/components/ui/toast';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { SeletorDeDia } from './seletor-de-dia';
import { ValueStepper } from './value-stepper';
import { Text } from '@/components/ui/text';
import { parseAmount } from './parse';

const HISTORY_DAYS = 30;

/**
 * Réplica de `apps/web/src/components/progress/log-weight-drawer.tsx`, com
 * edição e remoção — ver `log-history.tsx` para o porquê.
 */
export function LogWeightDrawer({
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
  const [weight, setWeight] = useState('');
  const [editing, setEditing] = useState<WeightLog | null>(null);
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
    queryKey: ['weight-logs', from],
    queryFn: () => progressApi.listWeights({ from }),
    enabled: open || embedded,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['progress', 'weight'] });
    queryClient.invalidateQueries({ queryKey: ['weight-logs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function reset() {
    setDia(date ?? hojeIso());
    setWeight('');
    setEditing(null);
    setFormError(null);
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ weightKg, id }: { weightKg: number; id: string | null }) =>
      // Dia passado vai ao meio-dia local (`instanteNoDia`); hoje, o servidor usa agora.
      id
        ? progressApi.updateWeight(id, { weightKg })
        : progressApi.createWeight({
            weightKg,
            ...(dia !== hoje ? { loggedAt: instanteNoDia(dia) } : {}),
          }),
    onSuccess: (_result, variables) => {
      invalidate();
      setWeight('');
      setEditing(null);
      // Criar fecha o drawer, como no PWA. Editar mantém aberto: a lista logo
      // abaixo é a confirmação de que a correção pegou.
      if (!variables.id) {
        setDia(date ?? hojeIso());
        onClose();
      }
    },
  });

  // Apaga sem perguntar; o aviso oferece "Desfazer" (`undo.ts` do api-client).
  const restore = useMutation({
    mutationFn: (log: WeightLog) => progressApi.createWeight(weightRestoreInput(log)),
    onSuccess: invalidate,
    onError: () => toast.show({ message: 'Não deu para desfazer. Registre de novo.' }),
  });

  const remove = useMutation({
    mutationFn: (log: WeightLog) => progressApi.deleteWeight(log.id),
    onSuccess: (_result, log) => {
      invalidate();
      toast.show({
        message: undoMessage('weight'),
        action: { label: 'Desfazer', onPress: () => restore.mutate(log) },
      });
      if (editing?.id === log.id) {
        setEditing(null);
        setWeight('');
      }
    },
  });

  function submit() {
    const value = parseAmount(weight);
    if (value === null || value <= 0) {
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
    time: clockTime(log.loggedAt),
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
              : dia === hoje
                ? 'Pesagem de hoje.'
                : `A pesagem vai para ${dayLabel(dia, hoje)}.`}
          </DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 py-3">
          {editing ? null : <SeletorDeDia dia={dia} hoje={hoje} onChange={setDia} />}
          <ValueStepper
            label="Peso (kg)"
            value={weight}
            onChange={setWeight}
            step={0.1}
            decimals={1}
            base={logs.data?.logs[0]?.weightKg ?? null}
            unit="kg"
            placeholder="0,0"
          />
          {error ? <FormMessage>{error}</FormMessage> : null}
          <Text className="text-center text-[13px] text-muted-foreground">
            De manhã, em jejum, é o mais consistente.
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
              setWeight(formatDecimal(log.weightKg));
              setFormError(null);
            }}
            onDelete={(entry) => {
              const log = logs.data?.logs.find((item) => item.id === entry.id);
              if (log) remove.mutate(log);
            }}
            pendingId={remove.isPending ? (remove.variables?.id ?? null) : null}
            emptyLabel="Nenhuma pesagem nos últimos 30 dias."
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
                setWeight('');
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

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressApi, type WeightLog } from '@fatia/api-client';
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
import { dayMonth, formatDecimal } from '@/components/charts';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { SheetField } from './sheet-field';
import { parseAmount } from './parse';

const HISTORY_DAYS = 30;

/**
 * Réplica de `apps/web/src/components/progress/log-weight-drawer.tsx`, com
 * edição e remoção — ver `log-history.tsx` para o porquê.
 */
export function LogWeightDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [weight, setWeight] = useState('');
  const [editing, setEditing] = useState<WeightLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const from = useMemo(
    () => new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
    [],
  );

  const logs = useQuery({
    queryKey: ['weight-logs', from],
    queryFn: () => progressApi.listWeights({ from }),
    enabled: open,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['progress', 'weight'] });
    queryClient.invalidateQueries({ queryKey: ['weight-logs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function reset() {
    setWeight('');
    setEditing(null);
    setFormError(null);
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ weightKg, id }: { weightKg: number; id: string | null }) =>
      id ? progressApi.updateWeight(id, { weightKg }) : progressApi.createWeight({ weightKg }),
    onSuccess: (_result, variables) => {
      invalidate();
      setWeight('');
      setEditing(null);
      // Criar fecha o drawer, como no PWA. Editar mantém aberto: a lista logo
      // abaixo é a confirmação de que a correção pegou.
      if (!variables.id) onClose();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => progressApi.deleteWeight(id),
    onSuccess: (_result, id) => {
      invalidate();
      if (editing?.id === id) {
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
    subtitle: dayMonth(log.loggedAt),
  }));

  const error = formError ?? (save.error as Error | null)?.message ?? null;

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
        <DrawerHeader className="px-0">
          <DrawerTitle>{editing ? 'Editar peso' : 'Logar peso'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo a pesagem de ${dayMonth(editing.loggedAt)}.`
              : 'Pesagem da manhã, em jejum, é o mais consistente.'}
          </DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 py-3">
          <SheetField
            label="Peso (kg)"
            value={weight}
            onChangeText={setWeight}
            placeholder="ex: 78,5"
            keyboardType="decimal-pad"
            autoFocus
            error={error}
          />

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
            onDelete={(entry) => remove.mutate(entry.id)}
            pendingId={remove.isPending ? (remove.variables ?? null) : null}
            emptyLabel="Nenhuma pesagem nos últimos 30 dias."
            confirmTitle="Apagar esta pesagem?"
          />
        </View>

        <DrawerFooter className="px-0">
          <Button onPress={submit} loading={save.isPending}>
            {editing ? 'Salvar alteração' : 'Salvar'}
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
      </DrawerContent>
    </Drawer>
  );
}

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { progressApi, type WaterLog } from '@fatia/api-client';
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
import { LogHistory, type LogHistoryEntry } from './log-history';
import { SheetField } from './sheet-field';
import { parseAmount } from './parse';

const PRESETS_ML = [250, 500, 750, 1000] as const;
const HISTORY_DAYS = 7;

/**
 * Réplica de `apps/web/src/components/progress/log-water-drawer.tsx`, com edição
 * e remoção — ver `log-history.tsx`.
 *
 * O histórico olha 7 dias, e não 30 como peso e passos: água tem vários logs por
 * dia e a lista de um mês seria longa demais para o que ela serve, que é
 * corrigir o gole registrado errado agora há pouco.
 */
export function LogWaterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ml, setMl] = useState('');
  const [editing, setEditing] = useState<WaterLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const from = useMemo(
    () => new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
    [],
  );

  const logs = useQuery({
    queryKey: ['water-logs', from],
    queryFn: () => progressApi.listWater({ from }),
    enabled: open,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['progress', 'water'] });
    queryClient.invalidateQueries({ queryKey: ['water-logs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function reset() {
    setMl('');
    setEditing(null);
    setFormError(null);
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ value, id }: { value: number; id: string | null }) =>
      id ? progressApi.updateWater(id, { ml: value }) : progressApi.createWater({ ml: value }),
    onSuccess: (_result, variables) => {
      invalidate();
      setMl('');
      setEditing(null);
      if (!variables.id) onClose();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => progressApi.deleteWater(id),
    onSuccess: (_result, id) => {
      invalidate();
      if (editing?.id === id) {
        setEditing(null);
        setMl('');
      }
    },
  });

  function submit() {
    const value = parseAmount(ml);
    if (value === null || value <= 0 || !Number.isInteger(value)) {
      setFormError('Valor inválido');
      return;
    }
    setFormError(null);
    save.mutate({ value, id: editing?.id ?? null });
  }

  const entries: LogHistoryEntry[] = (logs.data?.logs ?? []).map((log) => ({
    id: log.id,
    title: `${formatInteger(log.ml)} mL`,
    subtitle: dayMonth(log.date),
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
          <DrawerTitle>{editing ? 'Editar registro de água' : 'Registrar água'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo o registro de ${dayMonth(editing.date)}.`
              : 'Cada log soma ao total do dia.'}
          </DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 py-3">
          {/* Durante uma edição os atalhos sairiam do lugar: eles criam um
              registro novo, e não alteram o que está sendo corrigido. */}
          {editing ? null : (
            <View className="gap-2">
              <Text className="text-[11px] font-bold tracking-wide text-muted-foreground">
                QUANTIDADES COMUNS
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {PRESETS_ML.map((preset) => (
                  <Button
                    key={preset}
                    variant="secondary"
                    className="w-[48%]"
                    accessibilityLabel={`Adicionar ${preset} mililitros`}
                    disabled={save.isPending}
                    onPress={() => save.mutate({ value: preset, id: null })}
                  >
                    {`+${preset} mL`}
                  </Button>
                ))}
              </View>
            </View>
          )}

          <SheetField
            label="Quantidade personalizada (mL)"
            value={ml}
            onChangeText={setMl}
            placeholder="ex: 350"
            keyboardType="number-pad"
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
              setMl(String(log.ml));
              setFormError(null);
            }}
            onDelete={(entry) => remove.mutate(entry.id)}
            pendingId={remove.isPending ? (remove.variables ?? null) : null}
            emptyLabel="Nenhum registro de água nos últimos 7 dias."
            confirmTitle="Apagar este registro de água?"
          />
        </View>

        <DrawerFooter className="px-0">
          <Button onPress={submit} loading={save.isPending} disabled={!ml.trim()}>
            {editing ? 'Salvar alteração' : 'Adicionar valor personalizado'}
          </Button>
          {editing ? (
            <Button
              variant="outline"
              onPress={() => {
                setEditing(null);
                setMl('');
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

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
  waterRestoreInput,
  type WaterLog,
} from '@fatia/api-client';
import { toast } from 'sonner';
import { hojeIso } from '@/lib/dias';
import { LogDayField } from './log-day-field';
import { LogHistory, type LogHistoryEntry } from './log-history';
import { dayMonth, formatInteger, hourMinute } from './log-format';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Dia em que o drawer abre; sem ele, hoje. */
  date?: string;
}

const PRESETS_ML = [250, 500, 750, 1000] as const;

/**
 * O histórico olha 7 dias, e não 30 como peso e passos: água tem vários
 * registros por dia e um mês de lista não serviria ao que ela serve — corrigir
 * o copo que acabou de ser registrado errado.
 */
const HISTORY_DAYS = 7;

export function LogWaterDrawer({ open, onClose, date }: Props) {
  const today = hojeIso();
  const [day, setDay] = useState(date ?? today);
  const [ml, setMl] = useState('');
  const [editing, setEditing] = useState<WaterLog | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const logs = useQuery({
    queryKey: ['water-logs', HISTORY_DAYS],
    queryFn: () =>
      progressApi.listWater({
        from: new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
      }),
    enabled: open,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['progress', 'water'] });
    qc.invalidateQueries({ queryKey: ['water-logs'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function clearForm() {
    setMl('');
    setEditing(null);
    setFormError(null);
  }

  function resetAll() {
    clearForm();
    setDay(date ?? hojeIso());
    save.reset();
    remove.reset();
  }

  const save = useMutation({
    mutationFn: ({ value, id }: { value: number; id: string | null }) =>
      // A edição manda só `ml`. `updateWater` aceita `date`, mas o service usa
      // spread condicional (`...(dto.date && { date: dto.date })`): campo
      // ausente não é escrito, então o registro fica no dia em que nasceu. O
      // default de "hoje" está no `create`, não no `update`.
      // Hoje não manda `date`: o padrão do servidor é hoje no fuso do perfil.
      id
        ? progressApi.updateWater(id, { ml: value })
        : progressApi.createWater({ ml: value, ...(day !== today ? { date: day } : {}) }),
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
    mutationFn: (log: WaterLog) => progressApi.createWater(waterRestoreInput(log)),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Não deu para desfazer. Registre de novo.'),
  });

  const remove = useMutation({
    mutationFn: (log: WaterLog) => progressApi.deleteWater(log.id),
    onSuccess: (_data, log) => {
      invalidate();
      toast(undoMessage('water'), {
        action: { label: 'Desfazer', onClick: () => restore.mutate(log) },
      });
      if (editing?.id === log.id) clearForm();
      inputRef.current?.focus();
    },
  });

  function submit() {
    const value = Number(ml);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      setFormError('Valor inválido');
      return;
    }
    setFormError(null);
    save.mutate({ value, id: editing?.id ?? null });
  }

  const entries: LogHistoryEntry[] = (logs.data?.logs ?? []).map((log) => ({
    id: log.id,
    title: `${formatInteger(log.ml)} mL`,
    // Com a hora, e não só o dia: dois copos de 500 mL na mesma terça são o
    // caso normal da água, e sem ela as duas linhas ficam idênticas — para
    // quem enxerga e para quem ouve.
    subtitle: `${dayMonth(log.date)} · ${hourMinute(log.loggedAt)}`,
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
          <DrawerTitle>{editing ? 'Editar registro de água' : 'Registrar água'}</DrawerTitle>
          <DrawerDescription>
            {editing
              ? `Corrigindo o registro de ${dayMonth(editing.date)}.`
              : `Cada registro soma ao total de ${dayLabel(day, today)}.`}
          </DrawerDescription>
        </DrawerHeader>
        <div className="my-3 space-y-4">
          {/* Editar nunca muda o dia (ver `save`): o campo é só de registro novo. */}
          {!editing && <LogDayField id="water-day" day={day} today={today} onChange={setDay} />}
          {/* Durante uma edição os atalhos sairiam do lugar: eles criam um
              registro novo, não alteram o que está sendo corrigido. */}
          {!editing && (
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-muted-foreground">
                QUANTIDADES COMUNS
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS_ML.map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ value: v, id: null })}
                    className="rounded-xl border border-water/30 bg-water/10 px-4 py-3 text-base font-bold text-water transition-colors hover:bg-water/20 disabled:opacity-50"
                  >
                    +{v} mL
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="water-custom" className="text-sm font-medium">
              Quantidade personalizada (mL)
            </label>
            <Input
              id="water-custom"
              ref={inputRef}
              type="number"
              inputMode="numeric"
              value={ml}
              onChange={(e) => setMl(e.target.value)}
              placeholder="ex: 350"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {remove.error && <p className="text-sm text-danger">{(remove.error as Error).message}</p>}

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
              setMl(String(log.ml));
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
            emptyLabel="Nenhum registro de água nos últimos 7 dias."
          />

          <div className="space-y-2">
            <Button className="w-full" onClick={submit} disabled={save.isPending || !ml.trim()}>
              {save.isPending
                ? 'Salvando…'
                : editing
                  ? 'Salvar alteração'
                  : day === today
                    ? 'Adicionar valor personalizado'
                    : `Adicionar em ${dayLabel(day, today)}`}
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

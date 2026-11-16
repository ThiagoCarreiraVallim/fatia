'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import {
  FEELINGS,
  currentChipIndex,
  revealOffset,
  feelingOf,
  feelingToRpe,
  loadFieldValue,
  loadToKg,
  loadUnitLabel,
  rpeToFeeling,
  workoutApi,
  type SessionSet,
} from '@fatia/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { cn } from '@/lib/utils';
import { formatNumber, formatPreviousSet, parseDecimalInput } from './format';

/**
 * "Como foi a série?" (prancha Al-T3): os cinco rostos da escala. Vale para a
 * série e para o treino; o que se grava é o nível (1–5), e a série o leva no
 * `rpe` (`feelingToRpe`).
 */
export function FeelingPicker({
  label,
  value,
  onChange,
  size = 'md',
}: {
  label: string;
  value: number | null;
  onChange: (level: number | null) => void;
  size?: 'md' | 'lg';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-1.5">
      {FEELINGS.map((f) => {
        const checked = value === f.level;
        return (
          <button
            key={f.level}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${f.label}, ${f.hint}`}
            // Tocar de novo no marcado desmarca: a resposta é opcional.
            onClick={() => onChange(checked ? null : f.level)}
            className={cn(
              'anim-press flex flex-col items-center justify-center gap-0.5 rounded-field border-2',
              size === 'lg' ? 'h-16' : 'h-14',
              checked
                ? 'border-primary bg-primary-soft text-foreground'
                : 'border-transparent bg-card text-muted-foreground',
            )}
          >
            <span aria-hidden className="text-2xl">
              {f.emoji}
            </span>
            {size === 'lg' && (
              <span aria-hidden className="text-[10px] font-bold">
                {f.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * As séries do exercício como chips numa linha (prancha Al-T3): as feitas em
 * verde-claro ("1  50×10 🙂"), a da vez com contorno ("3 agora"), as que faltam
 * apagadas e o "Todas ›" no fim, que abre o treino inteiro. Tocar numa feita
 * abre o editor dela ali mesmo, com carga e repetições digitáveis.
 */
export function SetChips({
  sessionId,
  sets,
  isCardio,
  targetSets = 0,
  onAll,
}: {
  sessionId: string;
  sets: SessionSet[];
  isCardio: boolean;
  /** Com meta, a linha mostra também a série da vez e as que faltam. */
  targetSets?: number;
  onAll?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const units = useUnitPrefs();
  const open = sets.find((s) => s.id === openId) ?? null;
  const openIndex = open ? sets.indexOf(open) : -1;
  const pending = Math.max(0, targetSets - sets.length);
  const stripRef = useRef<HTMLUListElement>(null);
  const current = currentChipIndex({ done: sets.length, target: targetSets });

  // O chip da vez sempre à vista (pedido do dono): na série 4 de 4 a faixa
  // mostrava só os dois primeiros. Rola o mínimo, a cada série registrada.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-chip="${current}"]`);
    if (!strip || !chip) return;
    const box = strip.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    const itemStart = rect.left - box.left + strip.scrollLeft;
    const left = revealOffset({
      offset: strip.scrollLeft,
      viewport: strip.clientWidth,
      content: strip.scrollWidth,
      itemStart,
      itemEnd: itemStart + rect.width,
      margin: 16,
    });
    if (left !== strip.scrollLeft) strip.scrollTo?.({ left, behavior: 'smooth' });
  }, [current, sets.length, targetSets]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ul
          ref={stripRef}
          className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
        >
          {sets.map((s, i) => {
            const summary = formatPreviousSet({ ...s, rpe: null }, isCardio, units) ?? '—';
            const feeling = feelingOf(rpeToFeeling(s.rpe));
            const editing = openId === s.id;
            return (
              <li key={s.id} data-chip={i} className="shrink-0">
                <button
                  type="button"
                  aria-expanded={editing}
                  aria-label={`Editar série ${i + 1}: ${summary}${feeling ? `, ${feeling.label}` : ''}`}
                  onClick={() => setOpenId(editing ? null : s.id)}
                  className={cn(
                    'anim-press flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold tabular-nums',
                    editing
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary-soft text-foreground',
                  )}
                >
                  <span className={editing ? '' : 'text-primary-text'}>{i + 1}</span>
                  <span>{summary}</span>
                  {feeling && <span aria-hidden>{feeling.emoji}</span>}
                </button>
              </li>
            );
          })}
          {Array.from({ length: pending }, (_, k) => {
            const n = sets.length + k + 1;
            const current = k === 0;
            return (
              <li
                key={`falta-${n}`}
                data-chip={n - 1}
                aria-label={current ? `Série ${n}, a da vez` : `Série ${n}, falta`}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold',
                  current
                    ? 'shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))] text-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <span className="text-muted-foreground">{n}</span>
                <span>{current ? 'agora' : '—'}</span>
              </li>
            );
          })}
        </ul>
        {onAll && (
          <button
            type="button"
            onClick={onAll}
            className="anim-press flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-muted pe-2.5 ps-3.5 text-[13px] font-bold text-foreground"
          >
            Todas
            <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <SetEditor
          key={open.id}
          sessionId={sessionId}
          set={open}
          index={openIndex}
          isCardio={isCardio}
          onDone={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  decrementLabel,
  incrementLabel,
  integer,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  decrementLabel: string;
  incrementLabel: string;
  integer?: boolean;
}) {
  const bump = (delta: number) => {
    const n = parseDecimalInput(value) ?? 0;
    const next = Math.max(0, Math.round((n + delta) * 100) / 100);
    onChange(formatNumber(integer ? Math.round(next) : next));
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={decrementLabel}
        onClick={() => bump(-step)}
        className="anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground"
      >
        <Minus size={16} aria-hidden />
      </button>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        className="h-11 w-full min-w-0 rounded-xl bg-background text-center text-lg font-extrabold text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        aria-label={incrementLabel}
        onClick={() => bump(step)}
        className="anim-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background text-foreground"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

/** O editor de uma série feita: carga/reps (ou distância/tempo), sensação, Excluir e Salvar. */
export function SetEditor({
  sessionId,
  set,
  index,
  isCardio,
  onDone,
}: {
  sessionId: string;
  set: SessionSet;
  index: number;
  isCardio: boolean;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const units = useUnitPrefs();
  const unit = loadUnitLabel(units.loadUnit);
  const n = index + 1;

  const [load, setLoad] = useState(() =>
    set.weightKg == null ? '' : formatNumber(loadFieldValue(set.weightKg, units.loadUnit)),
  );
  const [reps, setReps] = useState(() => (set.reps == null ? '' : String(set.reps)));
  const [km, setKm] = useState(() =>
    set.distanceMeters == null ? '' : formatNumber(set.distanceMeters / 1000),
  );
  const [minutes, setMinutes] = useState(() =>
    set.durationSeconds == null ? '' : formatNumber(Math.round(set.durationSeconds / 60)),
  );
  const [feeling, setFeeling] = useState<number | null>(() => rpeToFeeling(set.rpe));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['workout', 'active'] });
    void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof workoutApi.updateSet>[2] = {};
      if (isCardio) {
        const d = parseDecimalInput(km);
        const m = parseDecimalInput(minutes);
        if (d != null) body.distanceMeters = Math.round(d * 1000);
        if (m != null) body.durationSeconds = Math.round(m * 60);
      } else {
        const w = parseDecimalInput(load);
        const r = parseDecimalInput(reps);
        if (w != null) body.weightKg = loadToKg(w, units.loadUnit);
        if (r != null) body.reps = Math.round(r);
      }
      if (feeling != null) body.rpe = feelingToRpe(feeling);
      return workoutApi.updateSet(sessionId, set.id, body);
    },
    onSuccess: () => {
      refresh();
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => workoutApi.deleteSet(sessionId, set.id),
    onSuccess: () => {
      setConfirmOpen(false);
      refresh();
      onDone();
    },
  });

  return (
    <div
      role="group"
      aria-label={`Editar série ${n}`}
      className="space-y-3 rounded-2xl border border-subtle bg-muted/40 p-3"
    >
      {isCardio ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={`Distância da série ${n} (km)`}
            value={km}
            onChange={setKm}
            step={0.1}
            decrementLabel="Menos 0,1 km"
            incrementLabel="Mais 0,1 km"
          />
          <NumberField
            label={`Duração da série ${n} (min)`}
            value={minutes}
            onChange={setMinutes}
            step={1}
            integer
            decrementLabel="Menos 1 minuto"
            incrementLabel="Mais 1 minuto"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <NumberField
            label={`Carga da série ${n} (${unit})`}
            value={load}
            onChange={setLoad}
            step={units.loadUnit === 'LB' ? 5 : 2.5}
            decrementLabel={units.loadUnit === 'LB' ? 'Menos 5 lb' : 'Menos 2,5 kg'}
            incrementLabel={units.loadUnit === 'LB' ? 'Mais 5 lb' : 'Mais 2,5 kg'}
          />
          <NumberField
            label={`Repetições da série ${n}`}
            value={reps}
            onChange={setReps}
            step={1}
            integer
            decrementLabel="Menos 1 repetição"
            incrementLabel="Mais 1 repetição"
          />
        </div>
      )}

      <FeelingPicker label={`Como foi a série ${n}?`} value={feeling} onChange={setFeeling} />

      {save.isError && (
        <p role="alert" className="text-center text-xs text-danger">
          Não foi possível salvar a série.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="anim-press h-11 flex-1 rounded-full text-sm font-bold text-danger"
        >
          Excluir
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="anim-press h-11 flex-[2] rounded-full bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Excluir série ${n}?`}
        description="A série sai do treino e do volume da sessão."
        confirmLabel="Excluir série"
        pendingLabel="Excluindo..."
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

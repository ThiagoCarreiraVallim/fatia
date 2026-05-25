'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Pause, Play, RotateCcw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workoutApi } from '@/lib/api/workout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExerciseGroup } from '@/lib/workout-session-view';

interface Props {
  sessionId: string;
  group: ExerciseGroup;
  onFinishExercise: () => void;
}

function fmtClock(s: number): string {
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = abs % 60;
  if (h > 0) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

function parseMmss(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(s) && s >= 0 && s < 60) return m * 60 + s;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) return h * 3600 + m * 60 + s;
  } else {
    const n = parseInt(trimmed, 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

function calcPace(seconds: number, meters: number): string | null {
  if (!seconds || !meters || meters <= 0) return null;
  const secondsPerKm = (seconds / meters) * 1000;
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

export function ActiveCardioCard({ sessionId, group, onFinishExercise }: Props) {
  const qc = useQueryClient();
  const existing = group.sets[0];

  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState<number>(existing?.durationSeconds ?? 0);
  const [durationInput, setDurationInput] = useState<string>(
    fmtClock(existing?.durationSeconds ?? 0),
  );
  const [editingDuration, setEditingDuration] = useState(false);

  const [distanceKm, setDistanceKm] = useState<string>(
    existing?.distanceMeters != null ? (existing.distanceMeters / 1000).toFixed(2) : '',
  );
  const [bpm, setBpm] = useState<string>(
    existing?.avgHeartRate != null ? String(existing.avgHeartRate) : '',
  );
  const [kcal, setKcal] = useState<string>(
    existing?.kcalBurned != null ? String(existing.kcalBurned) : '',
  );

  // Sincroniza relogio enquanto não está em modo de edição manual.
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      startRef.current = null;
      return;
    }
    const initial = seconds;
    startRef.current = Date.now();
    const t = setInterval(() => {
      if (startRef.current == null) return;
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      setSeconds(initial + elapsed);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    if (!editingDuration) setDurationInput(fmtClock(seconds));
  }, [seconds, editingDuration]);

  function commitDurationInput() {
    const parsed = parseMmss(durationInput);
    if (parsed != null) {
      setSeconds(parsed);
    } else {
      setDurationInput(fmtClock(seconds));
    }
    setEditingDuration(false);
  }

  function reset() {
    setRunning(false);
    setSeconds(0);
    setDurationInput('0:00');
  }

  const distanceMeters = distanceKm.trim()
    ? Math.round(Number(distanceKm.replace(',', '.')) * 1000)
    : null;
  const pace =
    distanceMeters != null && Number.isFinite(distanceMeters)
      ? calcPace(seconds, distanceMeters)
      : null;

  const persist = useMutation({
    mutationFn: () => {
      const body = {
        exerciseId: group.exerciseId,
        durationSeconds: seconds || undefined,
        distanceMeters:
          distanceMeters != null && Number.isFinite(distanceMeters) && distanceMeters > 0
            ? distanceMeters
            : undefined,
        avgHeartRate: bpm.trim() ? Number(bpm) : undefined,
        kcalBurned: kcal.trim() ? Number(kcal) : undefined,
      };
      if (existing) {
        return workoutApi.updateSet(sessionId, existing.id, body);
      }
      return workoutApi.logSet(sessionId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      setRunning(false);
    },
  });

  return (
    <div className="rounded-2xl border border-white/5 bg-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <button type="button" aria-label="Recolher" className="text-muted-foreground">
          <ChevronDown size={18} />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-extrabold tracking-wide text-blue-400">CARDIO</p>
          <h2 className="text-base font-extrabold text-foreground">{group.exerciseName}</h2>
        </div>
        <div className="w-5" />
      </div>

      {/* Cronômetro */}
      <div className="mx-4 mt-3 rounded-2xl bg-muted/40 p-4">
        <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
          DURAÇÃO
        </p>
        {editingDuration ? (
          <Input
            autoFocus
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={commitDurationInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDurationInput(fmtClock(seconds));
                setEditingDuration(false);
              }
            }}
            inputMode="numeric"
            placeholder="m:ss"
            className="mt-1 text-center text-4xl font-extrabold tabular-nums"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingDuration(true);
              setRunning(false);
            }}
            className="block w-full text-center text-5xl font-extrabold text-foreground tabular-nums hover:text-primary"
          >
            {fmtClock(seconds)}
          </button>
        )}
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            disabled={editingDuration}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.5)] disabled:opacity-50"
            aria-label={running ? 'Pausar' : 'Iniciar'}
          >
            {running ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-label="Zerar"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        <Field
          label="DISTÂNCIA (KM)"
          value={distanceKm}
          onChange={setDistanceKm}
          placeholder="0,00"
          step="0.01"
        />
        <Field
          label="FC (BPM)"
          value={bpm}
          onChange={(v) => setBpm(v.replace(/\D/g, ''))}
          placeholder="—"
          step="1"
        />
        <Field
          label="KCAL"
          value={kcal}
          onChange={(v) => setKcal(v.replace(/\D/g, ''))}
          placeholder="—"
          step="1"
        />
      </div>

      {pace && (
        <p className="mt-2 px-4 text-center text-[11px] font-bold text-blue-400">
          Pace estimado: <span className="tabular-nums">{pace}</span>
        </p>
      )}

      <div className="space-y-2 p-4">
        <Button
          className="h-12 w-full rounded-full text-sm font-extrabold shadow-[0_0_20px_hsl(var(--primary)/0.45)]"
          onClick={() => persist.mutate()}
          disabled={persist.isPending || (!seconds && !distanceMeters && !bpm && !kcal)}
        >
          <Check size={16} className="mr-1.5" />
          {persist.isPending ? 'Salvando...' : existing ? 'Atualizar sessão' : 'Salvar sessão'}
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full rounded-full text-sm font-extrabold"
          onClick={onFinishExercise}
        >
          Finalizar Exercício
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
        {label}
      </p>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        step={step}
        className="mt-1 h-10 border-0 bg-transparent p-0 text-center text-xl font-extrabold tabular-nums focus-visible:ring-0"
      />
    </div>
  );
}

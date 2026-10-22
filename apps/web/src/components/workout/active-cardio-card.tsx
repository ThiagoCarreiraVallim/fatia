'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseClock, workoutApi, type ExerciseGroup } from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseTitle } from './exercise-title';
import { formatClock, formatPace, formatPreviousSet } from './format';

interface Props {
  sessionId: string;
  group: ExerciseGroup;
  onFinishExercise: () => void;
}

export function ActiveCardioCard({ sessionId, group, onFinishExercise }: Props) {
  const qc = useQueryClient();
  const existing = group.sets[0];

  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState<number>(existing?.durationSeconds ?? 0);
  const [durationInput, setDurationInput] = useState<string>(
    formatClock(existing?.durationSeconds ?? 0),
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

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências, então o mostrador é reescrito nos mesmos
  // momentos — só que antes de pintar, o que aqui importa: com o efeito, cada
  // tique do cronômetro pintava um quadro com o segundo anterior. Não há passagem
  // de montagem porque o `useState` acima já inicializa com o mesmo `fmtClock`.
  const [previous, setPrevious] = useState({ seconds, editingDuration });
  if (previous.seconds !== seconds || previous.editingDuration !== editingDuration) {
    setPrevious({ seconds, editingDuration });
    if (!editingDuration) setDurationInput(formatClock(seconds));
  }

  function commitDurationInput() {
    const parsed = parseClock(durationInput);
    if (parsed != null) {
      setSeconds(parsed);
    } else {
      setDurationInput(formatClock(seconds));
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
      ? formatPace(seconds, distanceMeters)
      : null;

  // Sem `before` de propósito, como no app: o card de cardio não recebe o
  // início da sessão, e aqui a referência é só rótulo — não vira valor de campo.
  // Basta buscar uma vez e descartar o que for desta sessão. O card de força usa
  // o `before` porque lá o dado é o palpite de carga (#190).
  const lastSet = useQuery({
    queryKey: ['workout', 'last-set', group.exerciseId],
    queryFn: () => workoutApi.getLastSet(group.exerciseId),
    staleTime: Infinity,
  });
  const previousLabel = formatPreviousSet(
    lastSet.data && lastSet.data.sessionId !== sessionId ? lastSet.data : null,
    true,
  );

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
    <div className="rounded-2xl border border-subtle bg-card">
      {/* O "Recolher" que ficava à esquerda do nome não recolhia nada: saiu, e
          no lugar dele entrou o "Como fazer" e a última vez, como no app. */}
      <div className="flex flex-col items-center px-4 pt-4">
        <ExerciseTitle
          kicker="CARDIO"
          kickerClassName="text-water"
          exerciseId={group.exerciseId}
          exerciseName={group.exerciseName}
        />
        {previousLabel && (
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            Anterior: {previousLabel}
          </p>
        )}
      </div>

      {/* Cronômetro */}
      <div className="mx-4 mt-3 rounded-2xl bg-muted/40 p-4">
        <p className="text-center text-[10px] font-bold tracking-wide text-muted-foreground">
          DURAÇÃO
        </p>
        {editingDuration ? (
          <Input
            aria-label="Duração (mm:ss)"
            autoFocus
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={commitDurationInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDurationInput(formatClock(seconds));
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
            {formatClock(seconds)}
          </button>
        )}
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            disabled={editingDuration}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.5)] disabled:opacity-50"
            aria-label={running ? 'Pausar cronômetro' : 'Iniciar cronômetro'}
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-label="Zerar cronômetro"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        <Field
          label="DISTÂNCIA (KM)"
          accessibleLabel={`Distância em quilômetros de ${group.exerciseName}`}
          value={distanceKm}
          onChange={setDistanceKm}
          placeholder="0,00"
          step="0.01"
        />
        <Field
          label="FC (BPM)"
          accessibleLabel={`Frequência cardíaca média de ${group.exerciseName}`}
          value={bpm}
          onChange={(v) => setBpm(v.replace(/\D/g, ''))}
          placeholder="—"
          step="1"
        />
        <Field
          label="KCAL"
          accessibleLabel={`Calorias gastas em ${group.exerciseName}`}
          value={kcal}
          onChange={(v) => setKcal(v.replace(/\D/g, ''))}
          placeholder="—"
          step="1"
        />
      </div>

      {pace && (
        <p className="mt-2 px-4 text-center text-[11px] font-bold text-water">
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
  accessibleLabel,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  /** O rótulo visível é sigla em caixa alta ("FC (BPM)"); o leitor de tela ouve a frase. */
  accessibleLabel: string;
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
        aria-label={accessibleLabel}
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

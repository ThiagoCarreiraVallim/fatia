'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft, Trophy, Dumbbell, Footprints } from 'lucide-react';
import { workoutApi, type PersonalRecordEntry } from '@/lib/api/workout';

type SortKey = 'recent' | 'weight';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function RecordsPage() {
  const [sort, setSort] = useState<SortKey>('recent');
  const [muscle, setMuscle] = useState<string | null>(null);

  const records = useQuery({
    queryKey: ['workout', 'records'],
    queryFn: () => workoutApi.listPersonalRecords(),
  });

  const data = useMemo(() => records.data ?? [], [records.data]);

  const muscles = useMemo(() => [...new Set(data.map((r) => r.muscleGroup))].sort(), [data]);

  const filtered = useMemo(() => {
    const rows = muscle ? data.filter((r) => r.muscleGroup === muscle) : [...data];
    if (sort === 'weight') {
      rows.sort(
        (a, b) =>
          (b.maxWeightKg ?? b.maxDistanceMeters ?? 0) - (a.maxWeightKg ?? a.maxDistanceMeters ?? 0),
      );
    } else {
      rows.sort((a, b) => (b.lastPerformedAt ?? '').localeCompare(a.lastPerformedAt ?? ''));
    }
    return rows;
  }, [data, muscle, sort]);

  const recentPRs = useMemo(
    () =>
      data.filter((r) => {
        const d = daysAgo(r.achievedAt);
        return d != null && d <= 30;
      }).length,
    [data],
  );
  const totalSets = useMemo(() => data.reduce((acc, r) => acc + r.totalSets, 0), [data]);

  return (
    <div className="space-y-5 px-5 pt-4 pb-4">
      <header className="flex items-center gap-3">
        <Link
          href="/progress"
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-2xl font-extrabold text-foreground">Recordes</h1>
      </header>

      {/* Análise */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Exercícios" value={String(data.length)} />
        <StatCard label="Recordes (30d)" value={String(recentPRs)} highlight />
        <StatCard label="Séries totais" value={String(totalSets)} />
      </div>

      {/* Filtro por grupo */}
      {muscles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={muscle === null} onClick={() => setMuscle(null)}>
            Todos
          </Chip>
          {muscles.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {m}
            </Chip>
          ))}
        </div>
      )}

      {/* Ordenação */}
      <div className="flex gap-1">
        <SortBtn active={sort === 'recent'} onClick={() => setSort('recent')}>
          Mais recentes
        </SortBtn>
        <SortBtn active={sort === 'weight'} onClick={() => setSort('weight')}>
          Maior carga
        </SortBtn>
      </div>

      {records.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {records.data && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum recorde ainda. Registre séries durante o treino para começar.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <RecordRow key={r.exerciseId} record={r} />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-card p-3 text-center">
      <p
        className={`text-2xl font-extrabold tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}
      >
        {value}
      </p>
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-bold capitalize transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function RecordRow({ record: r }: { record: PersonalRecordEntry }) {
  const isCardio = r.type === 'cardio';
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
        {isCardio ? (
          <Footprints size={18} className="text-primary" />
        ) : (
          <Dumbbell size={18} className="text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{r.exerciseName}</p>
        <p className="text-xs capitalize text-muted-foreground">
          {r.muscleGroup} • {r.totalSets} série{r.totalSets !== 1 ? 's' : ''} •{' '}
          {fmtDate(r.achievedAt)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {isCardio ? (
          <>
            <p className="text-lg font-extrabold tabular-nums text-primary">
              {r.maxDistanceMeters != null ? (r.maxDistanceMeters / 1000).toFixed(2) : '—'}{' '}
              <span className="text-xs text-muted-foreground">km</span>
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {fmtDuration(r.bestDurationSeconds)}
            </p>
          </>
        ) : (
          <>
            <p className="text-lg font-extrabold tabular-nums text-primary">
              {r.maxWeightKg ?? '—'} <span className="text-xs text-muted-foreground">kg</span>
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {r.repsAtMax ?? '—'} reps · 1RM ~
              {r.estimated1RM != null ? Math.round(r.estimated1RM) : '—'}
            </p>
          </>
        )}
      </div>
      <Trophy size={16} className="shrink-0 text-amber-400" />
    </div>
  );
}

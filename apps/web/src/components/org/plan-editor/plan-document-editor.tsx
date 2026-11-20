'use client';

import { useId, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  HeartPulse,
  Plus,
  Repeat,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  circuitProblem,
  circuitSummary,
  exerciseLine,
  isCircuit,
  lastSetHint,
  MAX_PLAN_SESSIONS,
  MAX_SESSION_NAME,
  moveItem,
  newCircuitBlock,
  sessionLabel,
  sessionLetter,
  type DocumentCircuitView,
  type DocumentExerciseView,
  type DocumentItemView,
  type PlanCopy,
  type PlanDocumentView,
} from '@fatia/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ExerciseSearch, newExerciseRow } from './exercise-search';
import { CircuitOptions, ExerciseOptions } from './item-options';
import { NumField } from './num-field';

type Session = PlanDocumentView['sessions'][number];

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

const iconButton =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30';

const sessionIds = (s: Session) =>
  new Set(
    s.items.flatMap((i) =>
      (isCircuit(i) ? i.exercises : [i]).flatMap((e) =>
        e.exerciseId != null ? [e.exerciseId] : [],
      ),
    ),
  );

/**
 * O editor do documento (Pn-09): sessões à esquerda, a sessão aberta à
 * direita, cada linha com séries e repetições digitáveis e as opções num
 * painel. Mover é por arrastar ou por "Subir/Descer" (a alternativa
 * acessível). Serve ao modelo da biblioteca e à cópia de um aluno.
 */
export function PlanDocumentEditor({
  groupId,
  value,
  onChange,
  showWeekdays,
  student,
}: {
  groupId: string;
  value: PlanDocumentView;
  onChange: (next: PlanDocumentView) => void;
  /** A agenda é por dia da semana ("Datas"): cada sessão escolhe o dia. */
  showWeekdays: boolean;
  /** Na cópia: o nome e as últimas séries, para a dica nas opções. */
  student?: { name: string; lastSets: PlanCopy['lastSets'] };
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [cardioOnly, setCardioOnly] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const nameId = useId();
  const dayId = useId();

  const si = Math.min(active, value.sessions.length - 1);
  const session = value.sessions[si]!;
  const ids = sessionIds(session);

  const setSessions = (sessions: Session[]) => onChange({ ...value, sessions });
  const setSession = (next: Session) =>
    setSessions(value.sessions.map((s, i) => (i === si ? next : s)));
  const setItems = (items: DocumentItemView[]) => setSession({ ...session, items });
  const setItem = (ii: number, item: DocumentItemView) =>
    setItems(session.items.map((x, i) => (i === ii ? item : x)));
  const move = (from: number, to: number) => {
    setOpen(null);
    setItems(moveItem(session.items, from, to));
  };
  const select = (i: number) => {
    setActive(i);
    setOpen(null);
  };

  const addSession = () => {
    setSessions([...value.sessions, { name: '', weekday: null, items: [] }]);
    select(value.sessions.length);
  };
  const duplicateSession = () => {
    const copy = structuredClone(session);
    copy.weekday = null;
    const next = [...value.sessions];
    next.splice(si + 1, 0, copy);
    setSessions(next);
    select(si + 1);
  };
  const removeSession = () => {
    setSessions(value.sessions.filter((_, i) => i !== si));
    select(Math.max(0, si - 1));
  };
  const addCircuit = () => {
    setItems([...session.items, newCircuitBlock('AMRAP')]);
    setOpen(`c${session.items.length}`);
  };

  const takenDays = new Set(
    value.sessions.flatMap((s, i) => (i !== si && s.weekday ? [s.weekday] : [])),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Sessões" className="space-y-2">
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {value.sessions.map((s, i) => {
            const count = s.items.reduce(
              (n, it) => n + (isCircuit(it) ? it.exercises.length : 1),
              0,
            );
            return (
              <li key={i} className="shrink-0">
                <button
                  type="button"
                  aria-current={i === si ? 'true' : undefined}
                  onClick={() => select(i)}
                  className={cn(
                    'flex min-h-11 w-full min-w-[160px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                    i === si
                      ? 'border-primary bg-primary/10'
                      : 'border-subtle bg-card hover:bg-muted',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                      i === si ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                    )}
                  >
                    {sessionLetter(i)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {`Sessão ${sessionLabel(i, s.name)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        showWeekdays && s.weekday ? WEEKDAYS[s.weekday - 1] : null,
                        count === 0
                          ? 'vazia'
                          : `${count} ${count === 1 ? 'exercício' : 'exercícios'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={value.sessions.length >= MAX_PLAN_SESSIONS}
          onClick={addSession}
        >
          <Plus aria-hidden />
          Adicionar sessão
        </Button>
      </nav>

      <section
        aria-labelledby={`${nameId}-h`}
        className="min-w-0 space-y-4 rounded-2xl border border-subtle bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${nameId}-h`} className="text-base font-bold text-foreground">
            {`Sessão ${sessionLabel(si, session.name)}`}
          </h2>
          <span className="flex gap-1">
            <button
              type="button"
              aria-label="Duplicar sessão"
              title="Duplicar sessão"
              disabled={value.sessions.length >= MAX_PLAN_SESSIONS}
              onClick={duplicateSession}
              className={iconButton}
            >
              <Copy size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Apagar sessão"
              title="Apagar sessão"
              disabled={value.sessions.length <= 1}
              onClick={removeSession}
              className={cn(iconButton, 'text-danger hover:text-danger')}
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-1">
            <Label htmlFor={nameId} className="text-xs text-muted-foreground">
              Nome da sessão
            </Label>
            <Input
              id={nameId}
              value={session.name}
              maxLength={MAX_SESSION_NAME}
              placeholder="Pernas, Push, Full body..."
              onChange={(e) => setSession({ ...session, name: e.target.value })}
            />
          </div>
          {showWeekdays && (
            <div className="space-y-1">
              <Label htmlFor={dayId} className="text-xs text-muted-foreground">
                Dia da semana
              </Label>
              <Select
                value={String(session.weekday ?? 0)}
                onValueChange={(v) => setSession({ ...session, weekday: Number(v) || null })}
              >
                <SelectTrigger id={dayId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sem dia</SelectItem>
                  {WEEKDAYS.map((d, i) => (
                    <SelectItem key={d} value={String(i + 1)} disabled={takenDays.has(i + 1)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {session.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-subtle p-4 text-center text-sm text-muted-foreground">
            Sessão vazia. Busque um exercício abaixo, ou monte um circuito.
          </p>
        ) : (
          <>
            <ColumnHeads />
            <ol className="space-y-2">
              {session.items.map((item, ii) => (
                <li
                  key={ii}
                  draggable
                  onDragStart={(e) => {
                    setDrag(ii);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (drag !== null) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag !== null) move(drag, ii);
                    setDrag(null);
                  }}
                  onDragEnd={() => setDrag(null)}
                  className={cn(
                    'rounded-xl border border-subtle bg-background p-2 sm:p-3',
                    drag === ii && 'opacity-50',
                  )}
                >
                  {isCircuit(item) ? (
                    <CircuitRow
                      groupId={groupId}
                      block={item}
                      index={ii}
                      total={session.items.length}
                      open={open === `c${ii}`}
                      onToggle={() => setOpen(open === `c${ii}` ? null : `c${ii}`)}
                      onChange={(b) => setItem(ii, b)}
                      onMove={(to) => move(ii, to)}
                      onRemove={() => {
                        setOpen(null);
                        setItems(session.items.filter((_, i) => i !== ii));
                      }}
                      exclude={ids}
                    />
                  ) : (
                    <ExerciseRow
                      row={item}
                      index={ii}
                      total={session.items.length}
                      open={open === `e${ii}`}
                      onToggle={() => setOpen(open === `e${ii}` ? null : `e${ii}`)}
                      onChange={(r) => setItem(ii, r)}
                      onMove={(to) => move(ii, to)}
                      onRemove={() => {
                        setOpen(null);
                        setItems(session.items.filter((_, i) => i !== ii));
                      }}
                      hint={
                        student && item.exerciseId != null
                          ? lastSetHint(student.name, student.lastSets[String(item.exerciseId)])
                          : null
                      }
                    />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="space-y-2 border-t border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs font-medium text-muted-foreground">
              Adicionar exercício
            </span>
            <Button
              type="button"
              variant={cardioOnly ? 'default' : 'outline'}
              size="sm"
              aria-pressed={cardioOnly}
              onClick={() => setCardioOnly((c) => !c)}
            >
              <HeartPulse aria-hidden />
              Cardio
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addCircuit}>
              <Repeat aria-hidden />
              Circuito
            </Button>
          </div>
          <ExerciseSearch
            groupId={groupId}
            label="Adicionar exercício"
            cardioOnly={cardioOnly}
            exclude={ids}
            onPick={(hit) => {
              const row = newExerciseRow(hit);
              setItems([...session.items, row]);
              // O cardio precisa da meta: abre as opções dele já.
              setOpen(row.isCardio ? `e${session.items.length}` : null);
            }}
          />
        </div>
      </section>
    </div>
  );
}

function MoveButtons({
  name,
  index,
  total,
  onMove,
}: {
  name: string;
  index: number;
  total: number;
  onMove: (to: number) => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`Subir ${name}`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        className={iconButton}
      >
        <ArrowUp size={16} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Descer ${name}`}
        disabled={index >= total - 1}
        onClick={() => onMove(index + 1)}
        className={iconButton}
      >
        <ArrowDown size={16} aria-hidden />
      </button>
    </>
  );
}

function withField<K extends keyof DocumentExerciseView>(
  row: DocumentExerciseView,
  key: K,
  v: DocumentExerciseView[K] | undefined,
): DocumentExerciseView {
  const next = { ...row };
  if (v === undefined) delete next[key];
  else next[key] = v;
  return next;
}

/** Os títulos das colunas da tabela (só no computador; as células têm rótulo próprio). */
function ColumnHeads() {
  return (
    <div
      aria-hidden
      className="hidden items-center gap-2 px-3 text-xs font-medium text-muted-foreground md:flex"
    >
      <span className="flex-1 pl-6">Exercício</span>
      <span className="flex items-center gap-1">
        <span className="w-14 text-center">Séries</span>
        <span className="invisible text-xs">×</span>
        <span className="w-20 text-center">Repetições</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="w-20 text-center">Carga</span>
        <span className="w-20 text-center">Descanso</span>
      </span>
      <span className="w-36" />
    </div>
  );
}

function ExerciseRow({
  row,
  index,
  total,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  hint,
}: {
  row: DocumentExerciseView;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: DocumentExerciseView) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  hint: string | null;
}) {
  const repsId = useId();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <GripVertical
          size={16}
          aria-hidden
          className="hidden shrink-0 cursor-grab text-faint sm:block"
        />
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-sm font-semibold text-foreground">{row.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{exerciseLine(row)}</span>
        </span>
        {!row.isCardio && (
          <span className="flex items-center gap-1">
            <NumField
              label={`Séries de ${row.name}`}
              hideLabel
              value={row.targetSets}
              min={1}
              max={20}
              onChange={(v) => v !== undefined && onChange({ ...row, targetSets: v })}
              className="w-14"
            />
            <span aria-hidden className="text-xs text-muted-foreground">
              ×
            </span>
            <Label htmlFor={repsId} className="sr-only">
              {`Repetições de ${row.name}`}
            </Label>
            <Input
              id={repsId}
              value={row.targetReps}
              maxLength={20}
              onChange={(e) => onChange({ ...row, targetReps: e.target.value })}
              className="h-10 w-20"
            />
          </span>
        )}
        {!row.isCardio && (
          <span className="hidden items-center gap-1 md:flex">
            {row.loadMode === 'BAND' ? (
              <span className="w-20 text-center text-xs text-muted-foreground">elástico</span>
            ) : row.loadMode === 'PERCENT_1RM' ? (
              <NumField
                label={`% do 1RM de ${row.name}`}
                hideLabel
                placeholder="%"
                value={row.loadPercent}
                min={1}
                max={120}
                onChange={(v) => onChange(withField(row, 'loadPercent', v))}
                className="w-20"
              />
            ) : (
              <NumField
                label={`Carga de ${row.name}`}
                hideLabel
                placeholder="kg"
                integer={false}
                value={row.startLoadKg}
                onChange={(v) => onChange(withField(row, 'startLoadKg', v))}
                className="w-20"
              />
            )}
            <NumField
              label={`Descanso de ${row.name}`}
              hideLabel
              placeholder="s"
              value={row.restSeconds}
              max={900}
              onChange={(v) => onChange(withField(row, 'restSeconds', v))}
              className="w-20"
            />
          </span>
        )}
        <span className="flex items-center md:w-36 md:justify-end">
          <MoveButtons name={row.name} index={index} total={total} onMove={onMove} />
          <button
            type="button"
            aria-label={`Opções de ${row.name}`}
            aria-expanded={open}
            onClick={onToggle}
            className={cn(iconButton, open && 'bg-muted text-foreground')}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Tirar ${row.name}`}
            onClick={onRemove}
            className={iconButton}
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      </div>
      {open && <ExerciseOptions row={row} onChange={onChange} onClose={onToggle} hint={hint} />}
    </>
  );
}

function CircuitRow({
  groupId,
  block,
  index,
  total,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  exclude,
}: {
  groupId: string;
  block: DocumentCircuitView;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  onChange: (next: DocumentCircuitView) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  exclude: ReadonlySet<number>;
}) {
  const name = `o circuito ${index + 1}`;
  const problem = circuitProblem(block);
  const setExercise = (ei: number, e: DocumentExerciseView) =>
    onChange({ ...block, exercises: block.exercises.map((x, i) => (i === ei ? e : x)) });
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <GripVertical
          size={16}
          aria-hidden
          className="hidden shrink-0 cursor-grab text-faint sm:block"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Repeat size={14} aria-hidden className="text-primary" />
            {circuitSummary(block)}
          </span>
          {problem && !open && <span className="block text-xs text-danger">{problem}</span>}
        </span>
        <span className="flex items-center">
          <MoveButtons name={name} index={index} total={total} onMove={onMove} />
          <button
            type="button"
            aria-label="Opções do circuito"
            aria-expanded={open}
            onClick={onToggle}
            className={cn(iconButton, open && 'bg-muted text-foreground')}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Tirar ${name}`}
            onClick={onRemove}
            className={iconButton}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </span>
      </div>
      {block.exercises.length > 0 && (
        <ol className="ml-0 mt-2 space-y-1 border-l-2 border-primary/40 pl-3 sm:ml-6">
          {block.exercises.map((e, ei) => (
            <CircuitExercise
              key={ei}
              row={e}
              onChange={(next) => setExercise(ei, next)}
              onRemove={() =>
                onChange({ ...block, exercises: block.exercises.filter((_, i) => i !== ei) })
              }
            />
          ))}
        </ol>
      )}
      {open && (
        <CircuitOptions block={block} onChange={onChange} onClose={onToggle}>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Adicionar ao circuito</span>
            <ExerciseSearch
              groupId={groupId}
              label="Adicionar ao circuito"
              exclude={exclude}
              onPick={(hit) =>
                onChange({ ...block, exercises: [...block.exercises, newExerciseRow(hit, true)] })
              }
            />
          </div>
        </CircuitOptions>
      )}
    </>
  );
}

function CircuitExercise({
  row,
  onChange,
  onRemove,
}: {
  row: DocumentExerciseView;
  onChange: (next: DocumentExerciseView) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.name}</span>
      {row.isCardio ? (
        <span className="text-xs text-muted-foreground">{exerciseLine(row)}</span>
      ) : (
        <>
          <Label htmlFor={id} className="sr-only">
            {`Repetições de ${row.name}`}
          </Label>
          <Input
            id={id}
            value={row.targetReps}
            maxLength={20}
            onChange={(e) => onChange({ ...row, targetReps: e.target.value })}
            className="h-9 w-20"
          />
        </>
      )}
      <button
        type="button"
        aria-label={`Tirar ${row.name}`}
        onClick={onRemove}
        className={iconButton}
      >
        <X size={16} aria-hidden />
      </button>
    </li>
  );
}

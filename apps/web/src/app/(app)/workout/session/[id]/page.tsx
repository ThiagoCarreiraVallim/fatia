'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Check, Plus, Share2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import {
  invalidateSessionLists,
  ApiError,
  appendNoteShortcut,
  checkinDoneMessage,
  comparisonFacts,
  feelingOf,
  formatBestSet,
  lastWorkoutWhen,
  formatTrainingVolume,
  howItWentBody,
  muscleGroupLabel,
  noteShortcutsFor,
  questionsAudience,
  questionsTitle,
  recordsTitle,
  summaryFacts,
  summaryHeadline,
  workoutApi,
  type LoadUnit,
  type PostWorkoutQuestion,
  type WorkoutCheckinInput,
  type WorkoutSessionSummary,
} from '@fatia/api-client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/elements/error-state';
import { MuscleDiagram } from '@/components/workout/muscle-diagram';
import { FeelingPicker } from '@/components/workout/set-chips';
import { groupTone } from '@/components/workout/group-tone';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';
import { cn } from '@/lib/utils';

const card = 'rounded-card bg-card p-4';
const title = 'text-[15px] font-semibold text-foreground';

/**
 * "Treino feito!" (pranchas Al-T5 e Al-T5b): o fim do treino e, pelo
 * histórico, o resumo de qualquer sessão. Números, comparação com o último do
 * mesmo plano, recordes, músculos, a lista com a melhor série de cada
 * exercício, "Como foi o treino?" e, quando alguém da equipe lê Treino, as
 * perguntas dela.
 */
export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const query = useQuery({
    queryKey: ['workout', 'session', id, 'summary'],
    queryFn: () => workoutApi.getSessionSummary(id),
  });
  const stillOpen = query.data != null && query.data.completedAt == null;
  // Sem barra de topo nem voltar (prancha Al-T5, `hasTopBar`): o "Treino
  // feito" é foco, e o "Salvar" e o compartilhar são a saída.
  // Sessão ainda aberta (link antigo, outra aba): o lugar dela é o treino em
  // andamento, não o "Treino feito!" nem as perguntas do fim.
  useEffect(() => {
    if (stillOpen) router.replace('/workout');
  }, [stillOpen, router]);

  if (query.isLoading) {
    return (
      <div className="space-y-3 px-5 pt-4">
        <Skeleton className="h-8 w-48 rounded bg-muted" />
        <Skeleton className="h-24 rounded-3xl bg-muted" />
        <Skeleton className="h-44 rounded-3xl bg-muted" />
      </div>
    );
  }

  const notFound = query.error instanceof ApiError && query.error.status === 404;

  // Falha de rede não é "sessão não encontrada": dizer isso faria a pessoa
  // achar que o treino sumiu.
  if (query.isError && !notFound) {
    return (
      <div className="px-5 pt-4">
        <ErrorState
          className="max-w-none"
          title="Não foi possível carregar o treino"
          detail={query.error instanceof Error ? query.error.message : 'Tente de novo.'}
          retryLabel="Tentar de novo"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="px-5 pt-4">
        <EmptyState
          title="Sessão não encontrada"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/workout">Voltar para treinos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (stillOpen) return null;

  return <WorkoutDone summary={query.data} />;
}

function WorkoutDone({ summary }: { summary: WorkoutSessionSummary }) {
  const unit = useUnitPrefs().loadUnit;
  const facts = summaryFacts(summary, unit);
  // O aviso de "respostas enviadas" fica aqui: ao recarregar, o resumo já vem
  // com o check-in e o cartão das perguntas sai da tela.
  const [questionsSent, setQuestionsSent] = useState<string | null>(null);
  const totalGroupSets = summary.muscles.groups.reduce((acc, g) => acc + g.sets, 0);

  return (
    <div className="relative space-y-4 px-5 pt-2 pb-6">
      {/* O brilho verde que desce do topo (prancha Al-T5). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 h-64 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.28),transparent_70%)]"
      />
      <header className="relative flex flex-col items-center gap-2 pt-2 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <Check size={30} strokeWidth={3} />
        </span>
        <h1 className="font-display text-[28px] font-semibold text-foreground">Treino feito!</h1>
        <p className="text-[13px] text-muted-foreground">{summaryHeadline(summary)}</p>
      </header>

      <dl className="grid grid-cols-4 gap-2">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col-reverse rounded-field bg-card px-3 py-3">
            <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
            <dd className="whitespace-nowrap font-display text-lg font-semibold text-foreground tabular-nums">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {summary.comparison && (
        <section aria-labelledby="feito-comparacao" className={card}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="feito-comparacao" className={title}>
              Comparado ao último {summary.planName ?? 'treino'}
            </h2>
            <span className="shrink-0 text-xs text-muted-foreground">
              {lastWorkoutWhen(summary.comparison.startedAt)}
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {comparisonFacts(summary.comparison).map((c) => (
              <li key={c.label} className="flex flex-col-reverse">
                <p
                  className={cn(
                    'text-base font-bold tabular-nums',
                    c.tone === 'up' && 'text-primary-text',
                    c.tone === 'down' && 'text-warning',
                    c.tone === 'flat' && 'text-foreground',
                  )}
                >
                  {c.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.records.length > 0 && (
        <section
          aria-labelledby="feito-recordes"
          className="rounded-card bg-primary-soft p-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.5)]"
        >
          <h2 id="feito-recordes" className={cn(title, 'flex items-center gap-2')}>
            <Trophy size={18} className="text-primary-text" aria-hidden />
            {recordsTitle(summary.records.length)}
          </h2>
          <ul className="mt-2 space-y-1">
            {summary.records.map((r) => (
              <li key={r.exerciseId} className="flex justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{r.exerciseName}</span>
                <span className="shrink-0 font-bold tabular-nums text-foreground">
                  {formatBestSet({ ...r, avgHeartRate: null }, unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(summary.muscles.primary.length > 0 || summary.muscles.groups.length > 0) && (
        <section aria-labelledby="feito-musculos" className={card}>
          <h2 id="feito-musculos" className={title}>
            Músculos de hoje
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <div className="shrink-0">
              <MuscleDiagram
                primaryMuscles={summary.muscles.primary}
                secondaryMuscles={summary.muscles.secondary}
                view="both"
                sizeClassName="w-16"
              />
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {summary.muscles.groups.map((g) => (
                <li key={g.group} className="space-y-1">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-foreground">{muscleGroupLabel(g.group)}</span>
                    <span className="tabular-nums text-muted-foreground">{g.sets}</span>
                  </div>
                  <div aria-hidden className="h-1.5 rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${totalGroupSets ? (g.sets / totalGroupSets) * 100 : 0}%`,
                        background: groupTone(g.group),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {summary.exercises.length > 0 && (
        <section aria-labelledby="feito-exercicios" className={card}>
          <h2 id="feito-exercicios" className="text-xs text-muted-foreground">
            Exercícios
          </h2>
          <ul aria-label="Exercícios do treino" className="mt-2 divide-y divide-subtle">
            {summary.exercises.map((e) => {
              const feeling = feelingOf(e.feeling);
              return (
                <li key={e.exerciseId} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="h-9 w-[3px] shrink-0 rounded-full"
                    style={{ background: groupTone(e.isCardio ? 'cardio' : e.muscleGroup) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span className="truncate">{e.exerciseName}</span>
                      {e.isRecord && (
                        <Trophy
                          size={14}
                          className="shrink-0 text-primary-text"
                          aria-label="Recorde"
                          role="img"
                        />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {e.sets} {e.sets === 1 ? 'série' : 'séries'}
                      {e.isCardio ? ' · ' : ' · melhor '}
                      {formatBestSet(e.best, unit)}
                    </p>
                  </div>
                  {feeling && (
                    <span role="img" aria-label={feeling.label}>
                      {feeling.emoji}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {questionsSent ? (
        <p
          role="status"
          className="rounded-3xl bg-muted/50 px-4 py-3 text-center text-sm text-foreground"
        >
          {questionsSent}
        </p>
      ) : (
        summary.questions &&
        !summary.checkin && (
          <TeamQuestions
            sessionId={summary.sessionId}
            askedBy={summary.questions.askedBy}
            items={summary.questions.items}
            onSent={setQuestionsSent}
          />
        )
      )}

      {/* TODO(#desafios): o check-in do desafio da comunidade entra aqui. */}

      <HowItWent summary={summary} unit={unit} />
    </div>
  );
}

function HowItWent({ summary, unit }: { summary: WorkoutSessionSummary; unit: LoadUnit }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [feeling, setFeeling] = useState<number | null>(summary.feeling);
  const [note, setNote] = useState(summary.notes ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const body = howItWentBody(summary, { feeling, notes: note });
      if (Object.keys(body).length > 0) await workoutApi.updateSession(summary.sessionId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workout', 'session', summary.sessionId] });
      invalidateSessionLists(qc);
      router.push('/workout');
    },
  });

  async function share() {
    const text = [
      `Treino feito! ${summaryHeadline(summary)}`,
      `${summary.sets} séries · ${formatTrainingVolume(summary.volumeKg, unit)}`,
    ].join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast('Resumo copiado.');
    } catch {
      // Compartilhar cancelado pela pessoa: nada a fazer.
    }
  }

  const shortcuts = noteShortcutsFor(note);

  return (
    <>
      <section aria-labelledby="feito-como-foi" className={cn(card, 'space-y-3')}>
        <h2 id="feito-como-foi" className={title}>
          Como foi o treino?
        </h2>
        <FeelingPicker label="Como foi o treino?" value={feeling} onChange={setFeeling} />
        <Textarea
          aria-label="Observação do treino"
          placeholder="Algo para lembrar no próximo? (opcional)"
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
        />
        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setNote((current) => appendNoteShortcut(current, label))}
                className="anim-press flex min-h-11 items-center gap-1 rounded-full bg-muted px-3 text-[13px] font-bold text-foreground"
              >
                <Plus size={14} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </section>
      {save.isError && (
        <p role="alert" className="text-center text-xs text-danger">
          Não foi possível salvar. Tente de novo.
        </p>
      )}
      {/* Fora do cartão, como na prancha Al-T5: são a saída da tela. */}
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={() => void share()}
          aria-label="Compartilhar"
          className="anim-press flex h-14 w-14 items-center justify-center rounded-field bg-muted text-foreground"
        >
          <Share2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="anim-press h-14 rounded-full bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </>
  );
}

/** As perguntas rápidas da equipe (prancha Al-T5b): só quem lê Treino pergunta. */
function TeamQuestions({
  sessionId,
  askedBy,
  items,
  onSent,
}: {
  sessionId: string;
  askedBy: string[];
  items: readonly PostWorkoutQuestion[];
  onSent: (message: string) => void;
}) {
  const qc = useQueryClient();
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [pain, setPain] = useState<boolean | null>(null);
  const [painLocation, setPainLocation] = useState('');

  const send = useMutation({
    mutationFn: (body: WorkoutCheckinInput) => workoutApi.saveCheckin(sessionId, body),
    onSuccess: (_r, body) => {
      onSent(checkinDoneMessage(body.skipped === true, askedBy));
      void qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      invalidateSessionLists(qc);
    },
  });

  function submit() {
    const body: WorkoutCheckinInput = {};
    if (fatigue != null) body.fatigue = fatigue;
    if (pain != null) body.pain = pain;
    if (pain && painLocation.trim()) body.painLocation = painLocation.trim();
    send.mutate(body);
  }

  const heading = questionsTitle(askedBy);

  return (
    <section aria-labelledby="feito-perguntas" className={cn(card, 'space-y-4')}>
      <h2 id="feito-perguntas" className={title}>
        {heading}
      </h2>

      {items.map((q) =>
        q.kind === 'scale' ? (
          <div key={q.key} className="space-y-2">
            <p className="text-sm font-bold text-foreground">{q.label}</p>
            <div role="radiogroup" aria-label={q.label} className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={fatigue === n}
                  aria-label={String(n)}
                  onClick={() => setFatigue(fatigue === n ? null : n)}
                  className={cn(
                    'anim-press h-11 rounded-2xl border text-sm font-extrabold tabular-nums',
                    fatigue === n
                      ? 'border-primary bg-primary-soft text-foreground'
                      : 'border-subtle bg-muted text-muted-foreground',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {q.scaleLabels && (
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{q.scaleLabels[0]}</span>
                <span>{q.scaleLabels[1]}</span>
              </div>
            )}
          </div>
        ) : (
          <div key={q.key} className="space-y-2">
            <p className="text-sm font-bold text-foreground">{q.label}</p>
            <div role="radiogroup" aria-label={q.label} className="grid grid-cols-2 gap-2">
              {[
                { label: 'Não', value: false },
                { label: 'Sim', value: true },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={pain === o.value}
                  onClick={() => setPain(pain === o.value ? null : o.value)}
                  className={cn(
                    'anim-press h-11 rounded-2xl border text-sm font-bold',
                    pain === o.value
                      ? 'border-primary bg-primary-soft text-foreground'
                      : 'border-subtle bg-muted text-muted-foreground',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {pain && (
              <input
                type="text"
                aria-label="Onde doeu?"
                placeholder="Onde doeu? (opcional)"
                maxLength={120}
                value={painLocation}
                onChange={(e) => setPainLocation(e.target.value)}
                className="h-11 w-full rounded-2xl border border-subtle bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </div>
        ),
      )}

      {send.isError && (
        <p role="alert" className="text-center text-xs text-danger">
          Não foi possível enviar. Tente de novo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate({ skipped: true })}
          className="anim-press h-12 rounded-full bg-muted text-sm font-bold text-foreground disabled:opacity-60"
        >
          Pular
        </button>
        <button
          type="button"
          disabled={send.isPending}
          onClick={submit}
          className="anim-press h-12 rounded-full bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          Enviar
        </button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">{questionsAudience(askedBy)}</p>
    </section>
  );
}

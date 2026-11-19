'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  checkinLine,
  comparisonFacts,
  FEEDBACK_BODY_MAX,
  feedbackBodyLength,
  feelingOf,
  formatBestSet,
  formatTrainingVolume,
  panelHref,
  reactionEmoji,
  reviewApi,
  SESSION_REACTIONS,
  whatsappHref,
  type ReviewFeedback,
  type ReviewSessionSummary,
  type SessionReaction,
} from '@fatia/api-client';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { orgKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const day =
    d.toDateString() === today.toDateString()
      ? 'hoje'
      : d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${day} ${hm(iso)}`;
}

const kg = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** "62,5 kg × 8 · recorde"; cardio e peso do corpo como no histórico. */
function bestLine(e: ReviewSessionSummary['exercises'][number]): string {
  const base =
    e.best?.weightKg && !e.isCardio
      ? `${kg(e.best.weightKg)} kg × ${e.best.reps ?? 0}`
      : formatBestSet(e.best);
  return e.isRecord ? `${base} · recorde` : base;
}

const card = 'rounded-2xl bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--border))]';

function Fact({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className={cn(card, 'flex flex-col gap-1')}>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * A sessão feita no painel (#399, Pn-35 e Pn-35b). Com Treino liberado para
 * quem olha: duração, séries, volume, "Como foi", exercício por exercício, a
 * nota e a reação com comentário ("Enviar ao aluno"). Sem: só o aviso, sem
 * detalhe nem link da ficha. Abrir entra no histórico que a pessoa vê.
 */
export default function ReviewSessionPage() {
  const g = useOrgGroup();
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const key = [...orgKeys.all(g.id), 'review', 'session', sessionId] as const;
  const q = useQuery({ queryKey: key, queryFn: () => reviewApi.session(g.id, sessionId) });
  const view = q.data;
  useTopBarTitle(view?.shared ? (view.summary.planName ?? 'Treino livre') : 'Sessão');

  // `undefined`: não mexeu (fica a reação que já foi); `null`: tirou.
  const [reaction, setReaction] = useState<SessionReaction | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: () =>
      reviewApi.sendFeedback(g.id, sessionId, {
        ...(reaction !== undefined ? { reaction } : {}),
        ...(body.trim() ? { body: body.trim() } : {}),
      }),
    onSuccess: () => {
      if (view) toast(`Comentário enviado à ${firstNameOf(view.name)}`);
      setBody('');
      setReaction(undefined);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: [...orgKeys.all(g.id), 'review'] });
    },
    onError: () => toast('Não deu para enviar. Tente de novo.'),
  });

  if (q.isPending) return <Skeleton className="h-72 rounded-2xl bg-card" />;
  if (q.isError || !view) {
    const sumiu = q.error instanceof ApiError && (q.error.isNotFound || q.error.status === 403);
    return (
      <EmptyState
        title={sumiu ? 'Sessão indisponível' : 'Não deu para abrir a sessão'}
        description={
          sumiu
            ? 'A pessoa saiu da comunidade, a sessão foi apagada ou o endereço está errado.'
            : 'Tente de novo em instantes.'
        }
      />
    );
  }

  const back = (
    <Link
      href={panelHref(g.id, 'review')}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" /> Para revisar
    </Link>
  );

  if (!view.shared) {
    const first = firstNameOf(view.name);
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-8 text-center">
          <Lock aria-hidden className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">{first} não compartilha Treino</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Só a pessoa pode ligar em Comunidade → Sobre. A equipe vê só que a sessão aconteceu, sem
            detalhes.
          </p>
        </div>
      </div>
    );
  }

  const s = view.summary;
  const first = firstNameOf(view.name);
  const feeling = feelingOf(s.overallFeeling);
  const volumeDelta = s.comparison ? comparisonFacts(s.comparison)[0]!.value : null;
  const comoFoi = checkinLine(view.checkin);
  const note = view.checkin?.note ?? s.notes;
  const mine = view.feedback.find((f) => f.isMine) ?? null;
  const others = view.feedback.filter((f) => !f.isMine);
  const current = reaction === undefined ? (mine?.reaction ?? null) : reaction;
  // Conta como a API e o banco: por code point (um emoji é 1).
  const length = feedbackBodyLength(body);
  const tooLong = length > FEEDBACK_BODY_MAX;
  const changed = reaction !== undefined || body.trim() !== '';
  // Tirar a reação sem texto nenhum apagaria tudo: a API recusa, o botão também.
  const nothingLeft = current === null && !body.trim() && !mine?.body;
  const zap = view.whatsapp
    ? whatsappHref(view.whatsapp, `Oi, ${first}! Vi seu treino no Fatia. `)
    : null;
  const exercises = new Set(s.exercises.map((e) => e.exerciseId)).size;

  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{s.planName ?? 'Treino livre'}</h1>
          <p className="text-sm text-muted-foreground">
            {view.name} · {when(s.completedAt ?? s.startedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-muted"
            >
              <MessageCircle aria-hidden className="h-4 w-4" /> WhatsApp
            </a>
          )}
          <Link
            href={`${panelHref(g.id, 'members')}/${view.membershipId}`}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:bg-muted"
          >
            Ficha da {first}
          </Link>
        </div>
      </header>

      <section aria-label="Resumo da sessão" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Fact
          label="Duração"
          value={s.durationMinutes === null ? '—' : `${s.durationMinutes} min`}
          hint={s.completedAt ? `${hm(s.startedAt)} – ${hm(s.completedAt)}` : null}
        />
        <Fact
          label="Séries"
          value={String(s.sets)}
          hint={`${exercises} ${exercises === 1 ? 'exercício' : 'exercícios'}`}
        />
        <Fact
          label="Volume"
          value={formatTrainingVolume(s.volumeKg)}
          hint={
            volumeDelta && volumeDelta !== '—'
              ? `${volumeDelta.replace(/ [▲▼]$/, '')} vs sessão anterior`
              : null
          }
        />
        <Fact
          label="Como foi"
          value={feeling?.emoji ?? '—'}
          hint={comoFoi ?? feeling?.label ?? null}
        />
      </section>

      {s.exercises.length > 0 && (
        <table className="w-full table-fixed overflow-hidden rounded-2xl text-[13.5px] shadow-[inset_0_0_0_1px_hsl(var(--border))]">
          <thead className="bg-card text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                Exercício
              </th>
              <th
                scope="col"
                className="hidden w-24 px-3 py-2.5 text-left font-semibold sm:table-cell"
              >
                Feito
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                Melhor série
              </th>
              <th scope="col" className="w-16 px-3 py-2.5 text-left font-semibold">
                Sentiu
              </th>
            </tr>
          </thead>
          <tbody>
            {s.exercises.map((e) => (
              <tr key={e.exerciseId} className="border-t border-border">
                <td className="truncate px-3 py-3 font-semibold">{e.exerciseName}</td>
                <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">
                  {e.isCardio ? 'cardio' : `${e.sets} ${e.sets === 1 ? 'série' : 'séries'}`}
                </td>
                <td
                  className={cn('px-3 py-3', e.isRecord ? 'text-primary' : 'text-muted-foreground')}
                >
                  {bestLine(e)}
                </td>
                <td className="px-3 py-3" aria-label={feelingOf(e.feeling)?.label ?? 'sem marca'}>
                  {feelingOf(e.feeling)?.emoji ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {note && (
        <section aria-label={`Nota da ${first}`} className={card}>
          <p className="text-[13px] text-muted-foreground">Nota da {first}</p>
          <p className="mt-1 text-sm">“{note}”</p>
        </section>
      )}

      <section aria-label="Reação e comentário" className={cn(card, 'space-y-3')}>
        <p className="text-sm font-bold">Reação e comentário</p>
        {others.map((f) => (
          <FeedbackLine key={f.id} f={f} first={first} />
        ))}
        {mine && <FeedbackLine f={mine} first={first} />}
        <div className="flex gap-2" role="group" aria-label="Reação">
          {SESSION_REACTIONS.map((r) => {
            const on = current === r.key;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={on}
                aria-label={`${r.emoji} ${r.label}`}
                // Tocar na reação que já está tira a reação.
                onClick={() => setReaction(on ? null : r.key)}
                className={cn(
                  'flex h-10 w-12 items-center justify-center rounded-xl text-xl',
                  on
                    ? 'bg-primary/15 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.5)]'
                    : 'bg-muted',
                )}
              >
                {r.emoji}
              </button>
            );
          })}
        </div>
        <Textarea
          aria-label={`Comentário para a ${first}`}
          placeholder={`Escreva para a ${first}. A resposta vem pelo WhatsApp.`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <p
          className={cn(
            'text-right text-xs',
            tooLong ? 'font-semibold text-danger' : 'text-muted-foreground',
          )}
        >
          {length}/{FEEDBACK_BODY_MAX}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={panelHref(g.id, 'review')}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="font-semibold">Volta para Para revisar</span>
            <span className="block">depois de comentar, sai da fila</span>
          </Link>
          <Button
            disabled={send.isPending || tooLong || !changed || nothingLeft}
            onClick={() => send.mutate()}
          >
            <Send aria-hidden className="h-4 w-4" /> Enviar ao aluno
          </Button>
        </div>
      </section>
    </div>
  );
}

function FeedbackLine({ f, first }: { f: ReviewFeedback; first: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        {f.authorName ?? 'Equipe'} · {when(f.updatedAt)} · enviado à {first}
      </p>
      <p className="mt-1 text-sm">
        {f.reaction && <span className="mr-1.5">{reactionEmoji(f.reaction)}</span>}
        {f.body}
      </p>
    </div>
  );
}

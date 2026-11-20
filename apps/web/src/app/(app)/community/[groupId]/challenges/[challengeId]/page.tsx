'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import {
  challengePeriod,
  challengeScoreLabel,
  challengesApi,
  KIND_INFO,
  METRIC_INFO,
  PHOTO_CONSENT_TEXT,
  POINT_ITEM_INFO,
  pointsDayNote,
  type ActivityItem,
  type ChallengeDetail,
  type ChallengeToday,
  type PointsTable,
  type TodayItem,
} from '@fatia/api-client';
import {
  apiErrorMessage,
  challengeRuleRows,
  ChallengeStatusBadge,
  countsDays,
  kindShortLabel,
  KindIcon,
  Leaderboard,
  liters,
  litersNumber,
  peopleLabel,
  Podium,
  POINT_ITEM_ICON,
  privacyLine,
  rankNote,
  RuleList,
} from '@/components/challenges/challenge-ui';
import { communityKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** Onde ficam as medalhas da pessoa (Al-G11). */
const ACHIEVEMENTS_HREF = '/progress/achievements';

/** Usa o check-in com foto: só pelo app, com a câmera (ADR 044). */
function usesPhotoCheckin(c: ChallengeDetail): boolean {
  return c.kind === 'PHOTO' || (c.kind === 'POINTS' && (c.rules.pointsTable?.workout ?? 0) > 0);
}

/** "Hoje: 1,8 de 2,5 L", "Hoje: 6.240 de 10.000 passos", "Hoje: 2 de 6". Só da própria pessoa. */
function todayLine(c: ChallengeDetail, today: ChallengeToday | null): string | null {
  if (!today) return null;
  const item = (i: TodayItem['item']) => today.items.find((x) => x.item === i);
  switch (c.kind) {
    case 'WATER': {
      const w = item('water');
      return w && w.value !== null && w.goal !== null
        ? `Hoje: ${litersNumber(w.value)} de ${liters(w.goal)}`
        : null;
    }
    case 'STEPS': {
      const s = item('steps');
      return s && s.value !== null && s.goal !== null
        ? `Hoje: ${s.value.toLocaleString('pt-BR')} de ${s.goal.toLocaleString('pt-BR')} passos`
        : null;
    }
    case 'NUTRITION':
      return today.points > 0 ? 'Hoje: na meta' : 'Hoje: ainda não chegou na meta';
    case 'PHOTO':
      return today.checkedInAt ? 'Check-in de hoje feito' : 'Hoje ainda não';
    case 'POINTS': {
      const missing = today.items
        .filter((i) => !i.done)
        .map((i) => POINT_ITEM_INFO[i.item].label.toLowerCase());
      return `Hoje: ${today.points} de ${today.maxPoints ?? 0}${missing.length ? ` · faltam ${missing.join(', ')}` : ''}`;
    }
    default:
      return null;
  }
}

/** O cartão verde do topo (Cm-17): pontuação, posição, sequência e o dia de hoje. */
function Hero({ c }: { c: ChallengeDetail }) {
  const m = c.me!;
  const head = countsDays(c)
    ? `${m.score} de ${c.totalDays} dias`
    : c.kind === 'POINTS'
      ? `${m.score.toLocaleString('pt-BR')} pontos`
      : challengeScoreLabel(c, m.score);
  const title = [head, m.rank && c.status !== 'upcoming' ? `${m.rank}º` : null]
    .filter(Boolean)
    .join(' · ');
  const sub = [
    m.streak > 0 ? `${m.streak} ${m.streak === 1 ? 'dia seguido' : 'dias seguidos'}` : null,
    c.status === 'running' ? todayLine(c, c.today) : null,
  ].filter((x): x is string => Boolean(x));
  const progress =
    c.today && c.kind === 'WATER'
      ? c.today.items.find((i) => i.item === 'water')
      : c.today && c.kind === 'STEPS'
        ? c.today.items.find((i) => i.item === 'steps')
        : null;
  return (
    <section
      aria-label="Sua posição"
      className="space-y-2.5 rounded-card bg-primary p-[18px] text-primary-foreground"
    >
      <p className="text-xs font-bold uppercase opacity-70">{`Você, como ${m.displayName}`}</p>
      <p className="font-display text-h2">{title}</p>
      {sub.length > 0 && (
        <p className="text-sm font-semibold opacity-80">
          {sub.map((t, i) => (
            <span key={t}>
              {i > 0 && ' · '}
              <span>{t}</span>
            </span>
          ))}
        </p>
      )}
      {progress && progress.value !== null && progress.goal ? (
        <div className="h-2 overflow-hidden rounded bg-black/20">
          <div
            className="h-full rounded bg-primary-foreground"
            style={{ width: `${Math.min(100, (progress.value / progress.goal) * 100)}%` }}
          />
        </div>
      ) : null}
      {m.pendingReview > 0 && (
        <p className="text-xs font-semibold">
          {m.pendingReview === 1
            ? '1 check-in seu está em revisão e ainda não conta.'
            : `${m.pendingReview} check-ins seus estão em revisão e ainda não contam.`}
        </p>
      )}
    </section>
  );
}

function todayItemDetail(i: TodayItem): string {
  if (i.item === 'water' && i.value !== null && i.goal !== null) {
    return `${litersNumber(i.value)} de ${liters(i.goal)}`;
  }
  if (i.item === 'steps' && i.value !== null && i.goal !== null) {
    return `${i.value.toLocaleString('pt-BR')} de ${i.goal.toLocaleString('pt-BR')}`;
  }
  if (i.item === 'workout') return i.done ? 'check-in feito' : 'faça o check-in pelo app';
  return i.done ? 'na meta' : POINT_ITEM_INFO[i.item].explain;
}

/** "Seus pontos de hoje" do desafio de pontos (Cm-17c). */
function TodayPoints({ today, table }: { today: ChallengeToday; table: PointsTable }) {
  return (
    <section aria-labelledby="pontos-hoje" className="rounded-card bg-card px-4 py-3.5">
      <div className="flex items-center justify-between pb-1.5">
        <h2 id="pontos-hoje" className="font-semibold">
          Seus pontos de hoje
        </h2>
        <Badge variant="done" className="tabular-nums">
          {`${today.points} de ${today.maxPoints ?? 0}`}
        </Badge>
      </div>
      <ul>
        {today.items.map((i, idx) => (
          <li
            key={i.item}
            className={cn(
              'flex min-h-[52px] items-center gap-3',
              idx > 0 && 'border-t border-subtle',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full',
                i.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon name={i.done ? 'check' : POINT_ITEM_ICON[i.item]} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{POINT_ITEM_INFO[i.item].label}</span>
              <span className="block text-xs text-muted-foreground">{todayItemDetail(i)}</span>
            </span>
            <span
              className={cn(
                'text-sm font-bold tabular-nums',
                i.done ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {`+${i.points}`}
              <span className="sr-only">{i.done ? ' (feito)' : ' (falta)'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="pt-1.5 text-xs text-muted-foreground">
        {pointsDayNote(table, today.maxPoints ?? 0)}
      </p>
    </section>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "hoje 18:54", "ontem", "15 out". */
function whenLabel(a: ActivityItem, now = new Date()): string {
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterdayIso = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  const day =
    a.date === todayIso
      ? 'hoje'
      : a.date === yesterdayIso
        ? 'ontem'
        : challengePeriod({ startDate: a.date, endDate: a.date });
  if (!a.at) return day;
  const t = new Date(a.at);
  return `${day} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

function dayTitle(c: ChallengeDetail, a: ActivityItem): string {
  if (c.kind === 'POINTS') {
    if (a.parts.length === 0) return `${a.points} ${a.points === 1 ? 'ponto' : 'pontos'}`;
    return a.parts.map((p) => POINT_ITEM_INFO[p].label).join(', ');
  }
  if (c.kind === 'WATER') return 'Bateu a meta de água';
  if (c.kind === 'STEPS')
    return `Chegou a ${(c.rules.stepsGoal ?? 10000).toLocaleString('pt-BR')} passos`;
  if (c.kind === 'NUTRITION') {
    return c.metric === 'KCAL_IN_RANGE_DAYS'
      ? 'Dia na faixa de calorias'
      : 'Bateu a proteína do dia';
  }
  return 'Fez o check-in';
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/**
 * Uma linha da atividade. A foto só aparece na linha da própria pessoa: a dos
 * outros nunca é desenhada, nem borrada, mesmo que viesse (ADR 044).
 */
function ActivityRow({
  c,
  a,
  flagged,
  flagging,
  onFlag,
}: {
  c: ChallengeDetail;
  a: ActivityItem;
  flagged: boolean;
  flagging: boolean;
  onFlag: () => void;
}) {
  const photo = a.isMe && a.type === 'checkin' ? a.photoUrl : null;
  const review = a.status === 'review';
  return (
    <li
      className={cn(
        'space-y-2.5 rounded-card bg-card p-3.5',
        (review || flagged) && 'shadow-[inset_0_0_0_1.5px_hsl(var(--warning)/0.45)]',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold"
        >
          {initials(a.displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {a.displayName}
            {a.isMe && <span className="ml-1 font-normal text-muted-foreground">(você)</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{whenLabel(a)}</span>
        </span>
        {review && <Badge variant="lite">em revisão</Badge>}
        {a.status === 'voided' && <Badge variant="risk">anulado</Badge>}
        {c.kind === 'POINTS' && a.points > 0 && a.status === 'valid' && (
          <Badge variant="done" className="tabular-nums">{`+${a.points}`}</Badge>
        )}
      </div>

      {a.type === 'checkin' ? (
        <p className="text-sm">{a.isMe ? 'Seu check-in de treino' : 'Fez o check-in do treino'}</p>
      ) : (
        <p className="text-sm">{dayTitle(c, a)}</p>
      )}

      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, só da própria pessoa.
        <img
          src={photo}
          alt="Sua foto do check-in"
          className="max-h-64 w-full rounded-2xl object-cover"
        />
      )}

      {a.isMe && a.reason && (
        <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm">
          {a.status === 'voided'
            ? `A equipe anulou: ${a.reason}`
            : `Em revisão pela equipe: ${a.reason}. Não conta até ser aprovado.`}
        </p>
      )}

      {flagged ? (
        <p className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm">
          Você sinalizou. A equipe vai olhar; seu nome não aparece para a pessoa.
        </p>
      ) : (
        a.canFlag && (
          <Button size="sm" variant="outline" disabled={flagging} onClick={onFlag}>
            <Icon name="alert" size={16} />
            Não parece válido
          </Button>
        )
      )}
    </li>
  );
}

function joinExplain(c: ChallengeDetail): string {
  const period = challengePeriod(c);
  switch (c.kind) {
    case 'WATER':
      return `Conta os dias em que você chega a ${liters(c.rules.waterGoalMl ?? 2500)}, de ${period}. Os outros veem só os dias, nunca seus ml.`;
    case 'STEPS':
      return `Conta os dias com ${(c.rules.stepsGoal ?? 10000).toLocaleString('pt-BR')} passos ou mais, do celular ou relógio, de ${period}. Os outros veem só os dias, nunca seus passos.`;
    case 'NUTRITION':
      return `Conta os dias em que você chega na sua meta de ${c.metric === 'KCAL_IN_RANGE_DAYS' ? 'calorias' : 'proteína'}, de ${period}. Ninguém vê o que você comeu. Sem meta definida, os dias não contam: confira em Nutrição › Metas.`;
    case 'PHOTO':
      return `1 ponto por dia com check-in: foto tirada na hora, pelo app, logo depois de um treino registrado. De ${period}.`;
    case 'POINTS':
      return `Treino, água, passos e nutrição valem pontos, até ${c.rules.maxPointsPerDay ?? 6} por dia. Os outros veem só seus pontos, nunca ml, passos ou gramas.`;
    default: {
      const info = METRIC_INFO[c.metric];
      return info.usesOwnGoal
        ? `${info.explain} Conta pela sua meta de nutrição, sem mostrar quanto você comeu.`
        : info.explain;
    }
  }
}

/**
 * Entrar no desafio (Cm-09): o que conta e, com foto, o aceite (ADR 047). O nome no
 * ranking é o do perfil, sem pergunta.
 */
function JoinChallengeDialog({
  challenge: c,
  pending,
  onCancel,
  onConfirm,
}: {
  challenge: ChallengeDetail;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (acceptPhotoTerms: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const name = c.suggestedDisplayName;
  const blocked = (c.needsPhotoConsent && !accepted) || pending;
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocked) onConfirm(c.needsPhotoConsent && accepted);
          }}
        >
          <DialogHeader>
            <DialogTitle>{`Participar de ${c.title}`}</DialogTitle>
            <DialogDescription>
              Os participantes veem seu nome e sua pontuação. Você pode sair enquanto o desafio não
              acabar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-0.5 rounded-xl border border-subtle p-3 text-sm">
            <p>{`No ranking: ${name}`}</p>
            <p className="text-xs text-muted-foreground">
              É o nome do seu perfil. Para trocar, vá em Você → Editar perfil.
            </p>
          </div>
          <p className="flex gap-3 rounded-xl bg-muted p-3 text-sm">
            <KindIcon kind={c.kind} className="size-8" />
            <span>{joinExplain(c)}</span>
          </p>
          {c.needsPhotoConsent && (
            <div className="space-y-2 rounded-xl border border-subtle p-3">
              <p className="text-sm">{PHOTO_CONSENT_TEXT}</p>
              <div className="flex items-center gap-3">
                <Checkbox
                  label="Aceito as regras da foto de check-in"
                  checked={accepted}
                  onCheckedChange={setAccepted}
                />
                <span className="text-sm font-medium" aria-hidden>
                  Aceito as regras da foto de check-in
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={blocked}>
              {pending ? 'Entrando...' : `Participar como ${name}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Um desafio da comunidade (Cm-17, Cm-10, Cm-11): quem participa vê a própria
 * posição, a atividade, o ranking e as regras; quem só olha vê ranking e
 * regras. Foto de check-in só a própria pessoa vê (ADR 044); no navegador o
 * check-in não acontece: é só pelo app, com a câmera.
 */
export default function CommunityChallengePage() {
  const { groupId, challengeId } = useParams<{ groupId: string; challengeId: string }>();
  const qc = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: communityKeys.challenge(groupId, challengeId),
    queryFn: () => challengesApi.get(groupId, challengeId),
    retry: false,
  });
  useTopBarTitle(query.data?.title);

  const refreshList = () =>
    qc.invalidateQueries({ queryKey: communityKeys.challenges(groupId), exact: true });

  const join = useMutation({
    mutationFn: ({ accept }: { accept: boolean }) =>
      challengesApi.join(groupId, challengeId, undefined, accept ? { acceptPhotoTerms: true } : {}),
    onSuccess: (d) => {
      qc.setQueryData(communityKeys.challenge(groupId, challengeId), d);
      void refreshList();
      setJoining(false);
      toast('Você entrou no desafio.');
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para entrar agora.')),
  });

  const leave = useMutation({
    mutationFn: () => challengesApi.leave(groupId, challengeId),
    onSuccess: () => {
      setLeaving(false);
      toast('Você saiu do desafio.');
      void qc.invalidateQueries({ queryKey: communityKeys.challenge(groupId, challengeId) });
      void refreshList();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para sair agora.')),
  });

  const flag = useMutation({
    mutationFn: (checkinId: string) => challengesApi.flag(groupId, challengeId, checkinId),
    onSuccess: (_, checkinId) => {
      setFlaggedIds((s) => new Set(s).add(checkinId));
      toast('Enviado para a equipe revisar');
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para sinalizar agora.')),
  });

  if (query.isPending) return <Skeleton className="m-4 h-64 rounded-card bg-card" />;
  if (!query.data) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Trophy}
          title="Desafio não encontrado"
          description="Ele pode ter sido apagado, ou você não está mais na comunidade."
          action={
            <Link
              href={`/community/${groupId}/challenges`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Ver os desafios
            </Link>
          }
        />
      </div>
    );
  }

  const c = query.data;
  const inside = c.me !== null;
  const ended = c.status === 'ended';
  const showActivity = inside && !ended && c.kind !== 'METRIC';
  const activityLabel = c.kind === 'PHOTO' ? 'Check-ins' : 'Atividade';
  const privacy = privacyLine(c);

  return (
    <div className="space-y-4 p-4 pb-28">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChallengeStatusBadge challenge={c} />
          <span className="text-xs text-muted-foreground">
            {[challengePeriod(c), kindShortLabel(c), peopleLabel(c.participants)].join(' · ')}
          </span>
        </div>
        {c.description && <p className="whitespace-pre-line text-sm">{c.description}</p>}
        {c.endedEarly && (
          <p className="text-xs text-muted-foreground">
            A equipe encerrou o desafio antes da data.
          </p>
        )}
      </section>

      {ended ? (
        <section aria-label="Resultado" className="space-y-3">
          {c.resultPending ? (
            <p className="rounded-card bg-card p-4 text-sm">
              Resultado depois da revisão da equipe: o pódio sai até 24 h depois do fim, quando a
              fila de revisão estiver vazia.
            </p>
          ) : (
            c.leaderboard && <Podium entries={c.leaderboard} />
          )}
          {!inside && (
            <p className="text-sm text-muted-foreground">
              Este desafio terminou. Você não participou dele.
            </p>
          )}
        </section>
      ) : inside ? (
        <Hero c={c} />
      ) : (
        <section className="space-y-2 rounded-card bg-card p-4">
          <p className="flex items-center gap-3 font-semibold">
            <KindIcon kind={c.kind} />
            {`${KIND_INFO[c.kind].label}, ${challengePeriod(c)}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {`${joinExplain(c)} ${peopleLabel(c.participants)} participando.`}
          </p>
        </section>
      )}

      {inside && c.status === 'running' && c.kind === 'POINTS' && c.today && (
        <TodayPoints today={c.today} table={c.rules.pointsTable ?? {}} />
      )}

      {privacy && !ended && (
        <p className="flex items-start gap-2 rounded-[14px] bg-card px-3 py-2.5 text-xs text-muted-foreground">
          <Icon name="eye" size={16} className="mt-px" />
          {privacy}
        </p>
      )}

      <Tabs defaultValue={showActivity ? 'activity' : 'ranking'}>
        <UnderlineTabsList>
          {showActivity && (
            <UnderlineTabsTrigger value="activity">{activityLabel}</UnderlineTabsTrigger>
          )}
          <UnderlineTabsTrigger value="ranking">Ranking</UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="rules">Regras</UnderlineTabsTrigger>
        </UnderlineTabsList>
        {showActivity && (
          <TabsContent value="activity">
            {c.activity.length === 0 ? (
              <p className="rounded-card bg-card p-4 text-sm text-muted-foreground">
                Nada ainda. Os dias que contam aparecem aqui.
              </p>
            ) : (
              <ul aria-label={activityLabel} className="space-y-3">
                {c.activity.map((a) => (
                  <ActivityRow
                    key={a.id}
                    c={c}
                    a={a}
                    flagged={a.flaggedByMe || flaggedIds.has(a.id)}
                    flagging={flag.isPending && flag.variables === a.id}
                    onFlag={() => flag.mutate(a.id)}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        )}
        <TabsContent value="ranking" className="space-y-2">
          {c.status === 'upcoming' && (
            <p className="text-xs text-muted-foreground">A contagem começa no primeiro dia.</p>
          )}
          {c.leaderboard ? (
            <Leaderboard challenge={c} entries={c.leaderboard} />
          ) : (
            <p className="rounded-card bg-card p-4 text-sm text-muted-foreground">
              O ranking deste desafio aparece só para quem participa.
            </p>
          )}
          {!ended && <p className="text-xs text-muted-foreground">{rankNote(c)}</p>}
        </TabsContent>
        <TabsContent value="rules">
          <RuleList label="Regras do desafio" rows={challengeRuleRows(c)} />
        </TabsContent>
      </Tabs>

      {inside && c.status === 'running' && usesPhotoCheckin(c) && (
        <p className="flex items-start gap-3 rounded-card bg-card p-4 text-sm">
          <Icon name="phone" size={20} className="text-primary" />
          <span>
            <span className="block font-semibold">Faça o check-in pelo app, com a câmera.</span>
            <span className="block text-xs text-muted-foreground">
              {`Liberado até ${c.rules.checkin?.windowHours ?? 2} h depois de um treino registrado de ${c.rules.checkin?.minWorkoutMinutes ?? 20} min ou mais. No navegador não dá para enviar foto.`}
            </span>
          </span>
        </p>
      )}

      {ended && inside && (
        <Link
          href={ACHIEVEMENTS_HREF}
          className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-2')}
        >
          <Icon name="medal" size={16} />
          Ver nas conquistas
        </Link>
      )}

      {!inside && !ended && (
        <Button className="w-full" size="lg" onClick={() => setJoining(true)}>
          Participar do desafio
        </Button>
      )}

      {inside && !ended && (
        <Button
          variant="ghost"
          className="w-full text-danger hover:text-danger"
          onClick={() => setLeaving(true)}
        >
          Sair do desafio
        </Button>
      )}

      {joining && (
        <JoinChallengeDialog
          challenge={c}
          pending={join.isPending}
          onCancel={() => setJoining(false)}
          onConfirm={(accept) => join.mutate({ accept })}
        />
      )}

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Sair do desafio?"
        description={
          usesPhotoCheckin(c)
            ? 'Seu apelido e sua pontuação saem do ranking, e as fotos dos seus check-ins são apagadas na hora. Dá para entrar de novo enquanto ele não acabar.'
            : 'Seu apelido e sua pontuação saem do ranking. Dá para entrar de novo enquanto ele não acabar.'
        }
        confirmLabel="Sair"
        pendingLabel="Saindo..."
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </div>
  );
}

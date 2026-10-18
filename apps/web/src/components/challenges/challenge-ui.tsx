'use client';

import Link from 'next/link';
import { ChevronRight, Medal as MedalIcon, Trophy, Users } from 'lucide-react';
import {
  challengePeriod,
  challengeStatusLabel,
  MEDAL_LABEL,
  METRIC_INFO,
  participantsLabel,
  rankLabel,
  scoreLabel,
  type Challenge,
  type LeaderboardEntry,
  type Medal,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Peças dos desafios da comunidade (Fase 8a), iguais para o membro e para o
 * painel: o cartão, o selo de estado e o ranking.
 */

const COR_DA_MEDALHA: Record<Medal, string> = {
  gold: 'text-amber-500',
  silver: 'text-slate-400',
  bronze: 'text-orange-700',
};

export function MedalBadge({ medal }: { medal: Medal }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold">
      <MedalIcon size={16} className={COR_DA_MEDALHA[medal]} aria-hidden />
      {MEDAL_LABEL[medal]}
    </span>
  );
}

export function ChallengeStatusBadge({ challenge }: { challenge: Challenge }) {
  return (
    <Badge variant={challenge.status === 'running' ? 'default' : 'secondary'}>
      {challengeStatusLabel(challenge)}
    </Badge>
  );
}

/** O cartão da lista: o que mede, quando, quantos e, se a pessoa entrou, como está. */
export function ChallengeCard({ challenge: c, href }: { challenge: Challenge; href: string }) {
  const posicao = c.me ? rankLabel(c.me.rank) : null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent/40"
    >
      <Trophy size={20} className="shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{c.title}</span>
          <ChallengeStatusBadge challenge={c} />
        </span>
        <span className="block text-xs text-muted-foreground">
          {`${METRIC_INFO[c.metric].label} · ${challengePeriod(c)}`}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users size={12} aria-hidden />
            {participantsLabel(c.participants)}
          </span>
          {c.me && (
            <span className="font-medium text-foreground">
              {[scoreLabel(c.metric, c.me.score), posicao].filter(Boolean).join(' · ')}
            </span>
          )}
          {c.me?.medal && <MedalBadge medal={c.me.medal} />}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** O ranking, só para quem participa. A linha de quem vê aparece marcada. */
export function Leaderboard({
  challenge,
  entries,
}: {
  challenge: Challenge;
  entries: LeaderboardEntry[];
}) {
  const comPosicao = challenge.status !== 'upcoming';
  return (
    <ol className="divide-y rounded-2xl border border-subtle bg-card" aria-label="Ranking">
      {entries.map((e, i) => (
        <li
          key={`${e.displayName}-${i}`}
          aria-current={e.isMe ? 'true' : undefined}
          className={cn('flex items-center gap-3 px-4 py-3 text-sm', e.isMe && 'bg-primary/10')}
        >
          <span className="w-8 shrink-0 text-right font-semibold tabular-nums">
            {comPosicao ? `${e.rank}º` : '–'}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {e.displayName}
            {e.isMe && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
          </span>
          {e.medal && <MedalBadge medal={e.medal} />}
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {scoreLabel(challenge.metric, e.score)}
          </span>
        </li>
      ))}
    </ol>
  );
}

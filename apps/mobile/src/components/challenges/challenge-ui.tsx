import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Medal as MedalIcon, Trophy } from 'lucide-react-native';
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
import { cn } from '@/components/ui';
import { cores } from '@/theme/cores';

/** Equivalente de `apps/web/src/components/challenges/challenge-ui.tsx`. */

const COR_DA_MEDALHA: Record<Medal, string> = {
  gold: '#f59e0b',
  silver: '#94a3b8',
  bronze: '#c2410c',
};

export function MedalBadge({ medal }: { medal: Medal }) {
  return (
    <View className="flex-row items-center gap-1">
      <MedalIcon size={16} color={COR_DA_MEDALHA[medal]} />
      <Text className="text-xs font-semibold text-foreground">{MEDAL_LABEL[medal]}</Text>
    </View>
  );
}

export function ChallengeStatusBadge({ challenge }: { challenge: Challenge }) {
  const andando = challenge.status === 'running';
  return (
    <View className={cn('rounded-full px-2.5 py-0.5', andando ? 'bg-primary' : 'bg-muted')}>
      <Text
        className={cn(
          'text-xs font-semibold',
          andando ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {challengeStatusLabel(challenge)}
      </Text>
    </View>
  );
}

export function ChallengeCard({
  challenge: c,
  onPress,
}: {
  challenge: Challenge;
  onPress: () => void;
}) {
  const resumo = c.me
    ? [scoreLabel(c.metric, c.me.score), rankLabel(c.me.rank)].filter(Boolean).join(' · ')
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title}, ${challengeStatusLabel(c)}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <Trophy size={20} color={cores.primary} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-foreground">{c.title}</Text>
          <ChallengeStatusBadge challenge={c} />
        </View>
        <Text className="text-xs text-muted-foreground">
          {`${METRIC_INFO[c.metric].label} · ${challengePeriod(c)} · ${participantsLabel(c.participants)}`}
        </Text>
        {resumo ? <Text className="text-xs font-medium text-foreground">{resumo}</Text> : null}
        {c.me?.medal ? <MedalBadge medal={c.me.medal} /> : null}
      </View>
      <ChevronRight size={16} color={cores.mutedForeground} />
    </Pressable>
  );
}

export function Leaderboard({
  challenge,
  entries,
}: {
  challenge: Challenge;
  entries: LeaderboardEntry[];
}) {
  const comPosicao = challenge.status !== 'upcoming';
  return (
    <View
      accessibilityLabel="Ranking"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      {entries.map((e, i) => (
        <View
          key={`${e.displayName}-${i}`}
          className={cn(
            'flex-row items-center gap-3 px-4 py-3',
            i < entries.length - 1 && 'border-b border-border',
            e.isMe && 'bg-primary/10',
          )}
        >
          <Text className="w-8 text-right text-sm font-semibold text-foreground">
            {comPosicao ? `${e.rank}º` : '–'}
          </Text>
          <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
            {e.isMe ? `${e.displayName} (você)` : e.displayName}
          </Text>
          {e.medal ? <MedalBadge medal={e.medal} /> : null}
          <Text className="text-sm text-muted-foreground">
            {scoreLabel(challenge.metric, e.score)}
          </Text>
        </View>
      ))}
    </View>
  );
}

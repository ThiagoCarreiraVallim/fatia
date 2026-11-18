import { Pressable, View } from 'react-native';
import {
  challengeStatusLabel,
  KIND_INFO,
  MEDAL_LABEL,
  type Challenge,
  type ChallengeKind,
  type LeaderboardEntry,
  type Medal,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import { colors } from '@/theme/colors';
import { useTheme } from '@/theme/theme-provider';
import {
  cardSubtitle,
  kindShort,
  listNeedsCheckin,
  participantSummary,
  podiumOrder,
  trophyColor,
  rankScore,
} from './challenge-view';

/**
 * Peças das telas de desafio no app (pranchas Cm-08, Cm-10, Cm-11, Cm-17),
 * espelho de `apps/web/src/components/challenges/challenge-ui.tsx`.
 */

/** As cores das medalhas no canvas: fundo claro, texto escuro nos dois temas. */
const MEDAL_BG: Record<Medal, string> = {
  gold: '#fbbf24',
  silver: '#c9ced6',
  bronze: '#d08a52',
};
const MEDAL_INK = '#1a1a1a';

function kindColor(kind: ChallengeKind): string {
  switch (kind) {
    case 'WATER':
      return colors.water;
    case 'STEPS':
      return colors.steps;
    case 'POINTS':
    case 'METRIC':
      return colors.warning;
    default:
      return colors.primaryText;
  }
}

/** O ícone redondo do tipo (`chipic` do canvas). */
export function KindIcon({ kind, ended = false }: { kind: ChallengeKind; ended?: boolean }) {
  return (
    <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
      <Icon
        name={ended ? 'medal' : KIND_INFO[kind].icon}
        size={20}
        color={ended ? colors.mutedForeground : kindColor(kind)}
      />
    </View>
  );
}

export function MedalBadge({ medal }: { medal: Medal }) {
  return (
    <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: MEDAL_BG[medal] }}>
      <Text className="font-sans-bold text-xs" style={{ color: MEDAL_INK }}>
        {MEDAL_LABEL[medal].toLowerCase()}
      </Text>
    </View>
  );
}

export function ChallengeStatusBadge({ challenge }: { challenge: Challenge }) {
  const variant =
    challenge.status === 'running' ? 'done' : challenge.status === 'upcoming' ? 'trial' : 'pending';
  return <Badge variant={variant}>{challengeStatusLabel(challenge).toLowerCase()}</Badge>;
}

/** A barra fina de progresso (`.bar.thin`). */
export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <View className="h-full rounded-full bg-primary" style={{ width: `${pct * 100}%` }} />
    </View>
  );
}

/**
 * O cartão da lista (Cm-08). Quem participa vê posição, "X de N dias", a
 * sequência e, nos desafios com foto, o atalho do check-in. Quem não participa
 * vê o convite para olhar; o próximo, o "Me avise quando começar".
 */
export function ChallengeCard({
  challenge: c,
  onOpen,
  onCheckin,
  onJoin,
  onWatch,
  watchPending = false,
}: {
  challenge: Challenge;
  onOpen: () => void;
  onCheckin?: () => void;
  onJoin?: () => void;
  onWatch?: (on: boolean) => void;
  watchPending?: boolean;
}) {
  const s = participantSummary(c);
  const ended = c.status === 'ended';
  const checkin = listNeedsCheckin(c) && onCheckin;
  const subtitle = cardSubtitle(c, kindShort(c));

  if (ended) {
    const posicao = s?.rank ? ` · você ${s.rank}` : '';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.title}, encerrado${posicao}`}
        onPress={onOpen}
        className="flex-row items-center gap-3 rounded-card bg-card p-4 active:opacity-80"
      >
        <KindIcon kind={c.kind} ended />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-sans-bold text-foreground">
            {c.title}
          </Text>
          <Text className="text-xs text-muted-foreground">{`${subtitle}${posicao}`}</Text>
        </View>
        <Icon name="chevR" size={18} color={colors.mutedForeground} />
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        'gap-3 rounded-card bg-card p-4',
        c.me && checkin && 'border-[1.5px] border-primary/45',
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${c.title}`}
        onPress={onOpen}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        <KindIcon kind={c.kind} />
        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} className="font-sans-bold text-foreground">
            {c.title}
          </Text>
          <Text className="text-xs text-muted-foreground">{subtitle}</Text>
        </View>
        {s?.rank ? (
          <Badge variant="done">{s.rank}</Badge>
        ) : !c.me ? (
          <ChallengeStatusBadge challenge={c} />
        ) : null}
      </Pressable>

      {s ? (
        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-foreground">{s.progress}</Text>
            {s.streak ? (
              <View className="flex-row items-center gap-1">
                <Icon name="flame" size={16} color={colors.warning} />
                <Text className="text-xs text-muted-foreground">{s.streak}</Text>
              </View>
            ) : null}
          </View>
          {s.pct !== null ? <ProgressBar pct={s.pct} /> : null}
          {c.me && c.me.pendingReview > 0 ? (
            <Text className="text-xs text-warning">
              {c.me.pendingReview === 1
                ? '1 item seu em revisão pela equipe'
                : `${c.me.pendingReview} itens seus em revisão pela equipe`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {c.status === 'upcoming' && !c.me ? (
        <>
          {c.kind === 'STEPS' || (c.kind === 'POINTS' && c.rules.pointsTable?.steps) ? (
            <Text className="text-xs text-muted-foreground">
              Passos digitados à mão não contam neste desafio.
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            {onJoin ? (
              <Button size="sm" variant="outline" className="flex-1" onPress={onJoin}>
                Participar
              </Button>
            ) : null}
            {onWatch ? (
              <Button
                size="sm"
                variant={c.watching ? 'outline' : 'secondary'}
                className="flex-1"
                loading={watchPending}
                accessibilityState={{ checked: c.watching }}
                onPress={() => onWatch(!c.watching)}
              >
                {c.watching ? 'Avisaremos no início' : 'Me avise quando começar'}
              </Button>
            ) : null}
          </View>
        </>
      ) : null}

      {c.status === 'running' && !c.me ? (
        <>
          <Text className="text-xs text-muted-foreground">
            Você não participa. Dá para ver o ranking e as regras antes de entrar.
          </Text>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" className="flex-1" onPress={onOpen}>
              Ver desafio
            </Button>
            {onJoin ? (
              <Button size="sm" className="flex-1" onPress={onJoin}>
                Participar
              </Button>
            ) : null}
          </View>
        </>
      ) : null}

      {checkin ? (
        <>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" className="flex-1" onPress={onOpen}>
              Ver desafio
            </Button>
            <Button size="sm" className="flex-1" onPress={onCheckin}>
              <Icon name="camera" size={16} color={colors.primaryForeground} />
              <Text className="text-xs font-semibold text-primary-foreground">Fazer check-in</Text>
            </Button>
          </View>
          <Text className="text-xs text-muted-foreground">
            {`Check-in liberado até ${c.rules.checkin?.windowHours ?? 2} h depois de um treino registrado no app.`}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function RankBubble({ rank, show }: { rank: number; show: boolean }) {
  const medal: Medal | null =
    rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
  return (
    <View
      className={cn(
        'h-[26px] w-[26px] items-center justify-center rounded-full',
        !medal && 'bg-surface-3',
      )}
      style={medal && show ? { backgroundColor: MEDAL_BG[medal] } : undefined}
    >
      <Text
        className={cn('font-sans-extrabold text-xs', !(medal && show) && 'text-foreground')}
        style={medal && show ? { color: MEDAL_INK } : undefined}
      >
        {show ? String(rank) : '–'}
      </Text>
    </View>
  );
}

/** O ranking (Cm-10 e aba Ranking do Cm-17): posição, apelido, sequência e dias ou pontos. */
export function Leaderboard({
  challenge,
  entries,
  final = false,
}: {
  challenge: Challenge;
  entries: LeaderboardEntry[];
  /** Encerrado: a medalha vira selo, como no Cm-11. */
  final?: boolean;
}) {
  const comPosicao = challenge.status !== 'upcoming';
  if (entries.length === 0) {
    return <Text className="text-sm text-muted-foreground">Ninguém no ranking ainda.</Text>;
  }
  return (
    <View accessibilityLabel="Ranking" className="gap-1">
      {entries.map((e, i) => (
        <View
          key={`${e.displayName}-${i}`}
          className={cn(
            'min-h-[52px] flex-row items-center gap-3 rounded-[14px] px-3.5',
            e.isMe ? 'bg-primary/15' : 'bg-card',
          )}
        >
          <RankBubble rank={e.rank} show={comPosicao} />
          <Text numberOfLines={1} className="flex-1 font-sans-bold text-sm text-foreground">
            {e.isMe ? `${e.displayName} (você)` : e.displayName}
          </Text>
          {final && e.medal ? <MedalBadge medal={e.medal} /> : null}
          {!final && e.streak > 0 ? (
            <View className="flex-row items-center gap-1">
              <Icon name="flame" size={14} color={colors.warning} />
              <Text className="text-xs text-muted-foreground">{e.streak}</Text>
            </View>
          ) : null}
          <Text className="min-w-[64px] text-right text-sm text-foreground">
            {rankScore(challenge, e.score)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const PODIUM_HEIGHT = [80, 120, 56];

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** O pódio do encerrado (Cm-11): prata, ouro, bronze. */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const { theme } = useTheme();
  const ordem = podiumOrder(entries);
  if (ordem.length === 0) return null;
  return (
    <View
      accessibilityLabel={`Pódio: ${[...ordem]
        .sort((a, b) => a.rank - b.rank)
        .map((e) => `${e.rank}º ${e.displayName}`)
        .join(', ')}`}
      className="mt-2 flex-row items-end justify-center gap-2.5"
    >
      {ordem.map((e) => {
        const medal = e.medal as Medal;
        const first = e.rank === 1;
        const size = first ? 56 : 44;
        return (
          <View key={`${e.displayName}-${e.rank}`} className="items-center gap-1.5">
            {first ? <Icon name="trophy" size={24} color={trophyColor(theme)} /> : null}
            <View
              className="items-center justify-center rounded-full"
              style={{ width: size, height: size, backgroundColor: MEDAL_BG[medal] }}
            >
              <Text className="font-sans-bold text-sm" style={{ color: MEDAL_INK }}>
                {initials(e.displayName)}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              className="max-w-[96px] font-sans-bold text-[13px] text-foreground"
            >
              {e.isMe ? `${e.displayName} (você)` : e.displayName}
            </Text>
            <View
              className={cn(
                'items-center justify-center rounded-t-[14px]',
                first ? 'bg-primary/15' : 'bg-muted',
              )}
              style={{
                width: first ? 96 : 86,
                height: PODIUM_HEIGHT[e.rank === 1 ? 1 : e.rank === 2 ? 0 : 2],
              }}
            >
              <Text className="font-display text-h2 text-foreground">{`${e.rank}º`}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

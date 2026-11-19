'use client';

import Link from 'next/link';
import {
  ApiError,
  challengePeriod,
  challengeScoreLabel,
  challengeStatusLabel,
  KIND_INFO,
  MEDAL_LABEL,
  METRIC_INFO,
  POINT_ITEM_INFO,
  POINT_ITEMS,
  STEP_SOURCE_LABEL,
  type Challenge,
  type ChallengeKind,
  type LeaderboardEntry,
  type Medal,
  type PointItem,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * Peças dos desafios da comunidade (#395), iguais para o membro e para o
 * painel: ícone do tipo, cartão da lista, ranking, pódio e regras. Foto de
 * check-in nunca passa por aqui: só a própria pessoa e a equipe veem (ADR 044).
 */

/** O recado da API quando é culpa do pedido; senão, o texto padrão. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** Fundo e cor do ícone de cada tipo (cor sempre ao lado de texto). */
const KIND_TONE: Record<ChallengeKind, string> = {
  PHOTO: 'bg-primary/15 text-primary',
  METRIC: 'bg-warning/15 text-warning',
  WATER: 'bg-water/15 text-water',
  STEPS: 'bg-steps/15 text-steps',
  NUTRITION: 'bg-primary/15 text-primary',
  POINTS: 'bg-brand/15 text-brand',
};

export function KindIcon({ kind, className }: { kind: ChallengeKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl',
        KIND_TONE[kind],
        className,
      )}
    >
      <Icon name={KIND_INFO[kind].icon} size={20} />
    </span>
  );
}

/** "check-in com foto", "dias com 2,5 L de água", "treinos concluídos". */
export function kindShortLabel(c: Pick<Challenge, 'kind' | 'metric' | 'rules'>): string {
  switch (c.kind) {
    case 'PHOTO':
      return 'check-in com foto';
    case 'WATER':
      return `dias com ${liters(c.rules.waterGoalMl ?? 2500)} de água`;
    case 'STEPS':
      return `dias com ${(c.rules.stepsGoal ?? 10000).toLocaleString('pt-BR')} passos`;
    case 'NUTRITION':
      return c.metric === 'KCAL_IN_RANGE_DAYS' ? 'dias na faixa de calorias' : 'dias na proteína';
    case 'POINTS':
      return 'misto, em pontos';
    default:
      return METRIC_INFO[c.metric].label.toLowerCase();
  }
}

/** 1800 → "1,8" (o "1,8 de 2,5 L" do topo). */
export function litersNumber(ml: number): string {
  return (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/** 2500 → "2,5 L". */
export function liters(ml: number): string {
  return `${litersNumber(ml)} L`;
}

export function peopleLabel(n: number): string {
  return n === 1 ? '1 pessoa' : `${n} pessoas`;
}

/** Os tipos que contam dia: o cartão mostra "12 de 30 dias" e a barra. */
export function countsDays(c: Pick<Challenge, 'kind' | 'metric'>): boolean {
  return c.kind === 'METRIC' ? c.metric === 'ACTIVE_DAYS' : c.kind !== 'POINTS';
}

const MEDAL_STYLE: Record<Medal, string> = {
  // Fundo claro fixo com texto escuro: contraste igual nos dois temas.
  gold: 'bg-[#fbbf24] text-[#1a1a1a]',
  silver: 'bg-[#c9ced6] text-[#1a1a1a]',
  bronze: 'bg-[#d08a52] text-[#1a1a1a]',
};

export function MedalBadge({ medal }: { medal: Medal }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-pill px-2 text-xs font-bold',
        MEDAL_STYLE[medal],
      )}
    >
      {MEDAL_LABEL[medal]}
    </span>
  );
}

export function ChallengeStatusBadge({ challenge }: { challenge: Challenge }) {
  return (
    <Badge variant={challenge.status === 'running' ? 'done' : 'pending'}>
      {challengeStatusLabel(challenge)}
    </Badge>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RankPill({ rank }: { rank: number }) {
  return <Badge variant="done">{`${rank}º`}</Badge>;
}

function CardHead({ c }: { c: Challenge }) {
  return (
    <span className="flex items-center gap-3">
      <KindIcon kind={c.kind} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{c.title}</span>
        <span className="block text-xs text-muted-foreground">
          {[kindShortLabel(c), challengePeriod(c), peopleLabel(c.participants)].join(' · ')}
        </span>
      </span>
      {c.me?.rank ? <RankPill rank={c.me.rank} /> : null}
    </span>
  );
}

/** Dias e sequência de quem participa (Cm-08). */
function MyProgress({ c }: { c: Challenge }) {
  if (!c.me) return null;
  const streak = c.me.streak > 0 && (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon name="flame" size={16} className="text-brand" />
      {`${c.me.streak} seguidos`}
    </span>
  );
  if (!countsDays(c)) {
    return (
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{challengeScoreLabel(c, c.me.score)}</span>
        {streak}
      </span>
    );
  }
  const days = `${c.me.score} de ${c.totalDays} dias`;
  return (
    <span className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{days}</span>
        {streak}
      </span>
      <ProgressBar value={(c.me.score / Math.max(1, c.totalDays)) * 100} label={days} />
    </span>
  );
}

/**
 * O cartão da lista (Cm-08). Quem participa vê dias, sequência e posição;
 * quem não participa, um convite para olhar; o marcado, "Me avise".
 */
export function ChallengeCard({
  challenge: c,
  href,
  onWatch,
  watchPending,
}: {
  challenge: Challenge;
  href: string;
  onWatch?: (on: boolean) => void;
  watchPending?: boolean;
}) {
  if (c.status === 'ended') {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 rounded-card bg-card p-4 hover:bg-accent/40"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted"
        >
          <Icon name="medal" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{c.title}</span>
          <span className="block text-xs text-muted-foreground">
            {[
              kindShortLabel(c),
              challengePeriod(c),
              c.me?.rank ? `você ${c.me.rank}º` : null,
              c.resultPending ? 'resultado em revisão' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <Icon name="chevR" size={16} className="text-muted-foreground" />
      </Link>
    );
  }

  if (c.me) {
    return (
      <Link
        href={href}
        className="block space-y-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.35)] hover:bg-accent/40"
      >
        <CardHead c={c} />
        {c.status === 'upcoming' ? (
          <span className="block text-xs text-muted-foreground">
            {`${challengeStatusLabel(c)}. Você já está dentro.`}
          </span>
        ) : (
          <MyProgress c={c} />
        )}
        {c.me.pendingReview > 0 && (
          <span className="block text-xs text-warning">
            {c.me.pendingReview === 1
              ? '1 check-in seu em revisão'
              : `${c.me.pendingReview} check-ins seus em revisão`}
          </span>
        )}
      </Link>
    );
  }

  if (c.status === 'upcoming') {
    return (
      <div className="space-y-3 rounded-card bg-card p-4">
        <Link href={href} className="block hover:opacity-90">
          <CardHead c={c} />
        </Link>
        <p className="text-xs text-muted-foreground">
          {[challengeStatusLabel(c), KIND_INFO[c.kind].explain].join('. ')}
        </p>
        {onWatch && (
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {c.watching ? 'Vamos avisar quando começar' : 'Me avise quando começar'}
            </span>
            <Switch
              label="Me avise quando começar"
              checked={c.watching}
              disabled={watchPending}
              onCheckedChange={onWatch}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-card bg-card p-4">
      <CardHead c={c} />
      <p className="text-xs text-muted-foreground">
        Você não participa. Dá para ver o ranking e as regras antes de entrar.
      </p>
      <Link
        href={href}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-field bg-muted text-sm font-semibold hover:bg-accent"
      >
        <Icon name="eye" size={16} />
        Ver desafio
      </Link>
    </div>
  );
}

function RankCircle({ rank, show }: { rank: number; show: boolean }) {
  const medal: Medal | null =
    rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums',
        show && medal ? MEDAL_STYLE[medal] : 'bg-surface-3 text-foreground',
      )}
    >
      {show ? `${rank}º` : '–'}
    </span>
  );
}

/** O ranking (Cm-10): posição com a cor da medalha, apelido, sequência e pontuação. */
export function Leaderboard({
  challenge,
  entries,
}: {
  challenge: Challenge;
  entries: LeaderboardEntry[];
}) {
  const ranked = challenge.status !== 'upcoming';
  if (entries.length === 0) {
    return (
      <p className="rounded-card bg-card p-4 text-sm text-muted-foreground">
        Ninguém entrou ainda.
      </p>
    );
  }
  return (
    <ol className="space-y-1" aria-label="Ranking">
      {entries.map((e, i) => (
        <li
          key={`${e.displayName}-${i}`}
          aria-current={e.isMe ? 'true' : undefined}
          className={cn(
            'flex min-h-14 items-center gap-3 rounded-[14px] px-3.5 text-sm',
            e.isMe ? 'bg-primary/15' : 'bg-card',
          )}
        >
          <RankCircle rank={e.rank} show={ranked} />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {e.displayName}
            {e.isMe && <span className="ml-1 font-normal text-muted-foreground">(você)</span>}
          </span>
          {e.medal && <MedalBadge medal={e.medal} />}
          {e.streak > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
              aria-label={`${e.streak} dias seguidos`}
            >
              <Icon name="flame" size={14} className="text-brand" />
              {e.streak}
            </span>
          )}
          <span className="w-20 shrink-0 text-right tabular-nums">
            {challengeScoreLabel(challenge, e.score)}
          </span>
        </li>
      ))}
    </ol>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/**
 * O pódio do encerrado (Cm-11): prata, ouro, bronze, nessa ordem na tela. Sobe
 * quem tem medalha (a API só dá com pontos e com o resultado fechado), e o
 * empate divide o degrau: dois em 1º ficam lado a lado no do meio (#395 M7).
 */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const comMedalha = entries.filter((e) => e.medal !== null && e.score > 0 && e.rank <= 3);
  if (comMedalha.length === 0) return null;
  const degrau = (rank: number) => comMedalha.filter((e) => e.rank === rank);
  const ordem = [2, 1, 3]
    .map((rank) => ({ rank, linhas: degrau(rank) }))
    .filter((d) => d.linhas.length);
  const height = (rank: number) => (rank === 1 ? 'h-28' : rank === 2 ? 'h-20' : 'h-14');
  return (
    <ol aria-label="Pódio" className="flex items-end justify-center gap-2.5 pt-2">
      {ordem.flatMap(({ rank, linhas }) =>
        linhas.map((e) => {
          const medal = e.medal as Medal;
          return (
            <li key={`${e.displayName}-${rank}`} className="flex flex-col items-center gap-1.5">
              {rank === 1 && (
                <Icon
                  name="trophy"
                  size={24}
                  // Âmbar escuro no claro (contraste ≥ 3:1 sobre o cartão), o dourado no escuro.
                  className="text-[#b45309] dark:text-[#fbbf24]"
                  data-podium-trophy=""
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'flex items-center justify-center rounded-full font-bold',
                  rank === 1 ? 'size-14 text-base' : 'size-10 text-sm',
                  MEDAL_STYLE[medal],
                )}
              >
                {initials(e.displayName)}
              </span>
              <span className="max-w-24 truncate text-sm font-semibold">
                {e.isMe ? `${e.displayName} (você)` : e.displayName}
              </span>
              <span
                className={cn(
                  'flex w-24 items-center justify-center rounded-t-[14px] font-display text-h2',
                  height(rank),
                  rank === 1 ? 'bg-primary/15' : 'bg-muted',
                )}
              >
                {`${rank}º`}
              </span>
            </li>
          );
        }),
      )}
    </ol>
  );
}

export const POINT_ITEM_ICON: Record<PointItem, IconName> = {
  workout: 'camera',
  water: 'drop',
  steps: 'steps',
  protein: 'apple',
  kcal: 'flame',
};

/** Quem vê o quê, por tipo (Cm-17): uma linha no topo do desafio. */
export function privacyLine(c: Pick<Challenge, 'kind' | 'rules'>): string | null {
  switch (c.kind) {
    case 'PHOTO':
      return 'A foto do check-in é prova: só você e a equipe que revisa veem. Os outros veem só que você fez o check-in.';
    case 'WATER':
      return 'Os outros veem só se você bateu a meta no dia. Quantos ml você registrou fica com você.';
    case 'STEPS':
      return `Os outros veem só os dias em que você chegou a ${(c.rules.stepsGoal ?? 10000).toLocaleString('pt-BR')}. Seu total de passos fica com você.`;
    case 'NUTRITION':
      return 'Ninguém vê o que você comeu. O ranking mostra só os dias em que você chegou na sua meta.';
    case 'POINTS':
      return 'Os outros veem só seus pontos. Ml, passos, gramas e fotos ficam com você.';
    default:
      return null;
  }
}

/** A frase sob o ranking (Cm-17). */
export function rankNote(c: Pick<Challenge, 'kind' | 'rules'>): string {
  switch (c.kind) {
    case 'PHOTO':
      return 'Check-ins em revisão não contam até a equipe aprovar.';
    case 'WATER':
      return `Conta dias na meta, não litros. Acima de ${liters(c.rules.dailyCap ?? 4000)} no dia o app não soma.`;
    case 'STEPS':
      return 'Só contam passos do celular ou relógio. Passos digitados à mão ficam no seu diário, mas fora do desafio.';
    case 'NUTRITION':
      return 'Cada pessoa compete contra a própria meta. Gramas, calorias e refeições nunca aparecem.';
    case 'POINTS':
      return 'Pontos em revisão ficam pendentes até a equipe decidir.';
    default:
      return 'Atualiza a cada poucos minutos.';
  }
}

export interface RuleRow {
  icon: IconName;
  title: string;
  text: string;
}

function photoRules(min: number, hours: number): RuleRow[] {
  return [
    {
      icon: 'camera',
      title: 'Foto tirada na hora, pelo app',
      text: 'A galeria fica fechada. Foto repetida ou já usada é barrada.',
    },
    {
      icon: 'dumbbell',
      title: 'Ligada a um treino registrado',
      text: `O check-in puxa o treino do app. Precisa de pelo menos ${min} min.`,
    },
    {
      icon: 'clock',
      title: `Até ${hours} h depois do treino`,
      text: 'Treino lançado depois, com data passada, não conta.',
    },
    {
      icon: 'check',
      title: 'Um check-in por dia',
      text: 'Vale 1 ponto por dia, mesmo treinando duas vezes.',
    },
  ];
}

const REVIEW_RULES: RuleRow[] = [
  {
    icon: 'alert',
    title: 'Qualquer participante pode sinalizar',
    text: '“Não parece válido” manda o check-in para a equipe, sem mostrar a foto a quem sinalizou. Enquanto isso, ele não conta.',
  },
  {
    icon: 'shield',
    title: 'A equipe decide',
    text: 'Se a equipe anular, a pessoa é avisada com o motivo. Editar o treino depois do check-in também manda para revisão.',
  },
];

const RESULT_RULE: RuleRow = {
  icon: 'trophy',
  title: 'Resultado depois da revisão',
  text: 'O pódio sai até 24 h depois do fim, quando a fila de revisão estiver vazia.',
};

const OWN_DAY_RULE: RuleRow = {
  icon: 'clock',
  title: 'Só o registro do próprio dia',
  text: 'Dá para registrar até as 3h da manhã seguinte. Lançar dias passados não conta.',
};

/** As regras do desafio (aba Regras, Cm-17), montadas com os números dele. */
export function challengeRuleRows(c: Pick<Challenge, 'kind' | 'metric' | 'rules'>): RuleRow[] {
  const r = c.rules;
  const min = r.checkin?.minWorkoutMinutes ?? 20;
  const hours = r.checkin?.windowHours ?? 2;
  switch (c.kind) {
    case 'PHOTO':
      return [...photoRules(min, hours), ...REVIEW_RULES, RESULT_RULE];
    case 'WATER': {
      const goal = liters(r.waterGoalMl ?? 2500);
      return [
        {
          icon: 'target',
          title: 'Conta o dia, não o total',
          text: `Vale 1 ponto por dia em que você chega a ${goal}. Beber mais não dá mais pontos.`,
        },
        {
          icon: 'shield',
          title: `Até ${liters(r.dailyCap ?? 4000)} por dia`,
          text: 'Acima disso o app não soma. Água demais também faz mal.',
        },
        OWN_DAY_RULE,
        {
          icon: 'eye',
          title: 'Os outros não veem seus ml',
          text: 'O ranking mostra só os dias na meta.',
        },
        {
          icon: 'alert',
          title: 'Registro fora do padrão vai para revisão',
          text: 'Ex.: tudo lançado de uma vez, perto da meia-noite, todo dia. Só você e a equipe veem.',
        },
        RESULT_RULE,
      ];
    }
    case 'STEPS': {
      const goal = (r.stepsGoal ?? 10000).toLocaleString('pt-BR');
      const sources = r.allowedStepSources.filter((s) => s !== 'MANUAL');
      return [
        {
          icon: 'steps',
          title: 'Só passos do celular ou relógio',
          text: `${sources.length ? `Vêm de ${sources.map((s) => STEP_SOURCE_LABEL[s]).join(', ')}.` : 'Vêm do celular ou do relógio.'} Passos digitados à mão não contam.`,
        },
        {
          icon: 'target',
          title: `Conta o dia com ${goal}`,
          text: '1 ponto por dia, não importa quanto passar.',
        },
        {
          icon: 'clock',
          title: 'Sincroniza até as 3h',
          text: 'Passos que chegam depois disso não entram no dia.',
        },
        {
          icon: 'alert',
          title: 'Salto estranho vai para revisão',
          text: 'Ex.: 15 mil passos em 10 minutos. Só você e a equipe veem.',
        },
        {
          icon: 'eye',
          title: 'Os outros veem só os dias',
          text: 'Seu total de passos não aparece no ranking.',
        },
      ];
    }
    case 'NUTRITION': {
      const kcal = c.metric === 'KCAL_IN_RANGE_DAYS';
      return [
        {
          icon: 'target',
          title: kcal ? 'Dias na sua faixa de calorias' : 'Dias batendo a sua proteína',
          text: kcal
            ? 'Conta o dia em que você fica dentro da faixa da sua meta, nunca abaixo.'
            : 'Conta o dia em que você chega no mínimo da sua meta. Cada um tem a própria meta.',
        },
        {
          icon: 'eye',
          title: 'Ninguém vê o que você comeu',
          text: 'O ranking mostra só os dias. Nem gramas, nem calorias, nem refeições.',
        },
        OWN_DAY_RULE,
        {
          icon: 'heart',
          title: 'Nunca “quem come menos”',
          text: 'Desafio de nutrição conta faixa ou mínimo. Nunca menos calorias nem perda de peso.',
        },
      ];
    }
    case 'POINTS': {
      const table = r.pointsTable ?? {};
      const items: RuleRow[] = POINT_ITEMS.filter((i) => (table[i] ?? 0) > 0).map((i) => ({
        icon: POINT_ITEM_ICON[i],
        title: `${POINT_ITEM_INFO[i].label}: ${table[i]} ${table[i] === 1 ? 'pt' : 'pts'}`,
        text:
          i === 'workout'
            ? `Mesmas regras do check-in com foto: na hora, pelo app, ligado a um treino de ${min} min ou mais.`
            : i === 'water'
              ? `Até ${liters(r.dailyCap ?? 4000)} por dia contam.`
              : i === 'steps'
                ? 'Só passos do celular ou relógio.'
                : 'Ninguém vê o que você comeu.',
      }));
      return [
        ...items,
        {
          icon: 'shield',
          title: `Máximo de ${r.maxPointsPerDay ?? 6} pts por dia`,
          text: 'Treinar duas vezes não dobra os pontos.',
        },
        {
          icon: 'alert',
          title: 'Qualquer ponto pode ir para revisão',
          text: 'Enquanto a equipe decide, aquele ponto fica pendente.',
        },
      ];
    }
    default:
      return [
        { icon: 'target', title: METRIC_INFO[c.metric].label, text: METRIC_INFO[c.metric].explain },
        {
          icon: 'clock',
          title: 'Atualiza a cada poucos minutos',
          text: 'O ranking fecha no último dia, com o que foi registrado até lá.',
        },
        {
          icon: 'eye',
          title: 'Peso e medidas nunca contam',
          text: 'Os outros veem só seu apelido e sua pontuação.',
        },
      ];
  }
}

export function RuleList({ rows, label }: { rows: RuleRow[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-subtle overflow-hidden rounded-card bg-card">
      {rows.map((r) => (
        <li key={r.title} className="flex items-start gap-3 px-4 py-3.5">
          <Icon name={r.icon} size={18} className="mt-0.5 text-muted-foreground" />
          <span>
            <span className="block text-sm font-semibold">{r.title}</span>
            <span className="block text-xs text-muted-foreground">{r.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

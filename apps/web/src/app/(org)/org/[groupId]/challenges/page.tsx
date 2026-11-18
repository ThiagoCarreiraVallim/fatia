'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trophy } from 'lucide-react';
import {
  CHALLENGE_DESCRIPTION_MAX,
  CHALLENGE_TITLE_MAX,
  challengePeriod,
  challengeProblem,
  challengesApi,
  maxPointsOf,
  POINT_ITEM_INFO,
  POINT_ITEMS,
  POINT_VALUE_MAX,
  REVIEW_REASON_MAX,
  REVIEW_REASON_MIN,
  STEP_SOURCE_LABEL,
  STEP_SOURCES,
  type Challenge,
  type ChallengeInput,
  type ChallengeMetric,
  type PointItem,
  type PointsTable,
  type ReviewItem,
  type StepSource,
} from '@fatia/api-client';
import {
  apiErrorMessage,
  ChallengeStatusBadge,
  kindShortLabel,
  KindIcon,
  peopleLabel,
} from '@/components/challenges/challenge-ui';
import { communityKeys, orgKeys } from '@/components/community/query-keys';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * As escolhas de "O que conta" (Pn-13). O tipo `METRIC` de antes aparece como
 * três cartões (treinos, dias ativos, sequência); os outros são um tipo cada.
 */
const FORM_KINDS = [
  'PHOTO',
  'WORKOUT_SESSIONS',
  'WATER',
  'STEPS',
  'NUTRITION',
  'ACTIVE_DAYS',
  'STREAK_DAYS',
  'POINTS',
] as const;
type FormKind = (typeof FORM_KINDS)[number];

const FORM_KIND_INFO: Record<
  FormKind,
  { label: string; explain: string; kind: Challenge['kind'] }
> = {
  PHOTO: { label: 'Check-in com foto', explain: 'foto na hora após o treino', kind: 'PHOTO' },
  WORKOUT_SESSIONS: { label: 'Treinos', explain: 'sessões concluídas', kind: 'METRIC' },
  WATER: { label: 'Água', explain: 'dias na meta de água', kind: 'WATER' },
  STEPS: { label: 'Passos', explain: 'dias com a meta de passos', kind: 'STEPS' },
  NUTRITION: { label: 'Nutrição', explain: 'dias na proteína ou na faixa', kind: 'NUTRITION' },
  ACTIVE_DAYS: { label: 'Dias ativos', explain: 'treino, passos ou água', kind: 'METRIC' },
  STREAK_DAYS: { label: 'Sequência', explain: 'dias seguidos com registro', kind: 'METRIC' },
  POINTS: { label: 'Pontos (misto)', explain: 'soma vários hábitos', kind: 'POINTS' },
};

/** Fontes que podem contar; "Digitado à mão" aparece travado. */
const COUNTING_SOURCES = STEP_SOURCES.filter((s) => s !== 'MANUAL');

/** Padrão da prancha: treino 3, água, passos e proteína 1, calorias fora. */
const DEFAULT_POINTS: Record<PointItem, number> = {
  workout: 3,
  water: 1,
  steps: 1,
  protein: 1,
  kcal: 0,
};

/** O que o sistema aplica em cada tipo (Pn-13, "Contra trapaça"). Não se desliga. */
const ANTI_CHEAT: Record<FormKind, [string, string][]> = {
  PHOTO: [
    ['Só foto da câmera do app', 'galeria fechada, foto repetida barrada'],
    ['Ligado a treino registrado', 'mínimo de 20 min'],
    ['Até 2 h depois do treino', 'treino retroativo não conta'],
    ['1 check-in por dia', 'mesmo treinando duas vezes'],
    ['Membros podem sinalizar', 'vai para a fila "Para revisar"'],
  ],
  WORKOUT_SESSIONS: [
    ['Só treino registrado no app', 'conta a sessão concluída'],
    ['Peso e medidas nunca contam', 'o ranking mostra só os treinos'],
  ],
  WATER: [
    ['Só o registro do próprio dia', 'pode corrigir até as 3h'],
    ['Fora do padrão vai para revisão', 'ex.: tudo de uma vez perto da meia-noite'],
    ['Ranking mostra só os dias', 'nunca os ml de ninguém'],
  ],
  STEPS: [
    ['Passos digitados à mão não contam', 'só celular ou relógio'],
    ['Sincroniza até as 3h', 'depois disso não entra no dia'],
    ['Salto estranho vai para revisão', 'ex.: 15 mil passos em 10 min'],
    ['Ranking mostra só os dias', 'nunca o total de passos'],
  ],
  NUTRITION: [
    ['Só o registro do próprio dia', 'pode registrar até as 3h'],
    ['Cada pessoa contra a própria meta', 'nunca "menos calorias" nem perda de peso'],
    ['Ranking mostra só os dias', 'nunca gramas, kcal ou refeições'],
  ],
  ACTIVE_DAYS: [
    ['Só o registro do próprio dia', 'pode corrigir até as 3h'],
    ['Passos à mão não contam', 'só celular ou relógio'],
  ],
  STREAK_DAYS: [
    ['Só o registro do próprio dia', 'pode corrigir até as 3h'],
    ['Peso e medidas nunca contam', 'conta refeição, treino, passos ou água'],
  ],
  POINTS: [
    ['Treino só vale com check-in', 'mesmas regras do check-in com foto'],
    ['Passos à mão não contam', 'só celular ou relógio'],
    ['Água conta até o teto do dia', '4 L por padrão'],
    ['Membros podem sinalizar', 'o ponto fica pendente até decidir'],
    ['Ranking mostra só os pontos', 'nunca ml, passos ou gramas'],
  ],
};

function whoSeesWhat(kind: FormKind, points: Record<PointItem, number>): [string, string][] {
  const rows: [string, string][] = [
    [
      'Quem não participa vê o ranking e as regras',
      'nunca fotos nem números de ninguém, só apelido e pontuação',
    ],
    [
      'Quem participa vê a atividade, o ranking e as regras',
      'água, passos e nutrição mostram só os dias, nunca ml, passos ou gramas',
    ],
  ];
  if (kind === 'PHOTO' || (kind === 'POINTS' && points.workout > 0)) {
    rows.push([
      'A foto do check-in é prova',
      'só a pessoa e a equipe que revisa veem; é apagada 30 dias depois do fim',
    ]);
  }
  return rows;
}

function formKindOf(c: Pick<Challenge, 'kind' | 'metric'>): FormKind {
  if (c.kind !== 'METRIC') return c.kind;
  return c.metric === 'WORKOUT_SESSIONS' || c.metric === 'STREAK_DAYS' ? c.metric : 'ACTIVE_DAYS';
}

/** "1,5" ou "1.5" → 1500 ml; vazio ou inválido → NaN. */
function litersToMl(text: string): number {
  const v = Number(text.replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(v) ? NaN : Math.round(v * 1000);
}

const mlToLiters = (ml: number) => String(ml / 1000);

interface Draft {
  title: string;
  description: string;
  kind: FormKind;
  startDate: string;
  endDate: string;
  points: Record<PointItem, number>;
  maxOverride: number | null;
  waterGoal: string;
  waterCap: string;
  stepsGoal: string;
  sources: StepSource[];
  nutrition: ChallengeMetric;
}

function draftOf(c: Challenge | null, today: string): Draft {
  const table = c?.rules.pointsTable;
  return {
    title: c?.title ?? '',
    description: c?.description ?? '',
    kind: c ? formKindOf(c) : 'PHOTO',
    startDate: c?.startDate ?? today,
    endDate: c?.endDate ?? '',
    points: table
      ? (Object.fromEntries(POINT_ITEMS.map((i) => [i, table[i] ?? 0])) as Record<
          PointItem,
          number
        >)
      : { ...DEFAULT_POINTS },
    maxOverride: c?.rules.maxPointsPerDay ?? null,
    waterGoal: mlToLiters(c?.rules.waterGoalMl ?? 2500),
    waterCap: mlToLiters(c?.rules.dailyCap ?? 4000),
    stepsGoal: String(c?.rules.stepsGoal ?? 10000),
    sources: c?.rules.allowedStepSources.length
      ? c.rules.allowedStepSources.filter((s) => s !== 'MANUAL')
      : [...COUNTING_SOURCES],
    nutrition: c?.kind === 'NUTRITION' ? c.metric : 'PROTEIN_TARGET_DAYS',
  };
}

/** O formulário vira o corpo da API, com só o que é do tipo. */
function inputOf(d: Draft): ChallengeInput {
  const base: ChallengeInput = {
    title: d.title.trim(),
    description: d.description.trim() || null,
    startDate: d.startDate,
    endDate: d.endDate,
  };
  switch (d.kind) {
    case 'PHOTO':
      return { ...base, kind: 'PHOTO' };
    case 'WATER':
      return {
        ...base,
        kind: 'WATER',
        waterGoalMl: litersToMl(d.waterGoal),
        dailyCap: litersToMl(d.waterCap),
      };
    case 'STEPS':
      return {
        ...base,
        kind: 'STEPS',
        stepsGoal: Number(d.stepsGoal),
        allowedStepSources: d.sources,
      };
    case 'NUTRITION':
      return { ...base, kind: 'NUTRITION', metric: d.nutrition };
    case 'POINTS': {
      const pointsTable: PointsTable = {};
      for (const i of POINT_ITEMS) if (d.points[i] > 0) pointsTable[i] = d.points[i];
      return {
        ...base,
        kind: 'POINTS',
        pointsTable,
        maxPointsPerDay: d.maxOverride ?? maxPointsOf(pointsTable),
      };
    }
    default:
      return { ...base, kind: 'METRIC', metric: d.kind };
  }
}

/** Os limites da API que a função comum não confere (faixas de meta e teto). */
function rangeProblem(d: Draft, input: ChallengeInput): string | null {
  if (d.kind === 'WATER') {
    const goal = input.waterGoalMl ?? NaN;
    const cap = input.dailyCap ?? NaN;
    if (!(goal >= 500 && goal <= 6000)) return 'A meta de água vai de 0,5 a 6 L.';
    if (!(cap >= 1000 && cap <= 8000)) return 'O teto do dia vai de 1 a 8 L.';
  }
  if (d.kind === 'STEPS') {
    const goal = input.stepsGoal ?? NaN;
    if (!Number.isInteger(goal) || goal < 1000 || goal > 50000) {
      return 'A meta de passos vai de 1.000 a 50.000.';
    }
    if (d.sources.length === 0) return 'Escolha pelo menos uma fonte de passos.';
  }
  if (d.kind === 'POINTS') {
    const max = input.maxPointsPerDay ?? 0;
    if (!Number.isInteger(max) || max < 1 || max > 25) {
      return 'O máximo por dia vai de 1 a 25 pontos.';
    }
  }
  return null;
}

type Editing = { challenge: Challenge | null };

/**
 * Desafios pela equipe (Pn-13): marcar por tipo (com tabela de pontos, meta,
 * teto e fontes de passos), mudar antes de começar, encerrar e apagar; e a fila
 * "Para revisar", onde a equipe decide os check-ins sinalizados.
 */
export default function OrgChallengesPage() {
  const g = useOrgGroup();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [ending, setEnding] = useState<Challenge | null>(null);
  const [deleting, setDeleting] = useState<Challenge | null>(null);
  const list = useQuery({
    queryKey: communityKeys.challenges(g.id),
    queryFn: () => challengesApi.list(g.id),
  });
  const today = list.data?.today ?? '';
  const canReview = list.data?.challenges.some((c) => c.canReview) ?? false;
  // A lista só: a chave dela é prefixo da do detalhe de cada desafio.
  const refresh = () =>
    qc.invalidateQueries({ queryKey: communityKeys.challenges(g.id), exact: true });

  const save = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ChallengeInput }) =>
      id ? challengesApi.update(g.id, id, input) : challengesApi.create(g.id, input),
    onSuccess: (_, { id }) => {
      setEditing(null);
      toast(id ? 'Desafio atualizado.' : 'Desafio agendado.');
      void refresh();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar o desafio agora.')),
  });
  const end = useMutation({
    mutationFn: (id: string) => challengesApi.end(g.id, id),
    onSuccess: () => {
      setEnding(null);
      toast('Desafio encerrado. O ranking final sai depois da fila de revisão.');
      void refresh();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para encerrar agora.')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => challengesApi.remove(g.id, id),
    onSuccess: () => {
      setDeleting(null);
      toast('Desafio apagado.');
      void refresh();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para apagar agora.')),
  });

  return (
    <div className="max-w-6xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Contam constância, nunca peso ou medidas. Quem não participa pode olhar o ranking e as
        regras, sem ver fotos nem números de ninguém.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {!editing && (
            <Button size="sm" onClick={() => setEditing({ challenge: null })} disabled={!list.data}>
              <Plus className="h-4 w-4" aria-hidden />
              Novo desafio
            </Button>
          )}
          {editing && (
            <ChallengeForm
              key={editing.challenge?.id ?? 'new'}
              challenge={editing.challenge}
              today={today}
              pending={save.isPending}
              onCancel={() => setEditing(null)}
              onSave={(input) => save.mutate({ id: editing.challenge?.id ?? null, input })}
            />
          )}

          {list.isPending ? (
            <Skeleton className="h-24 rounded-card" />
          ) : list.data?.challenges.length ? (
            <section aria-labelledby="lista-desafios" className="space-y-2">
              <h2 id="lista-desafios" className="font-semibold">
                Desafios
              </h2>
              <ul className="space-y-2" aria-label="Desafios da comunidade">
                {list.data.challenges.map((c) => (
                  <ChallengeRow
                    key={c.id}
                    c={c}
                    onEdit={() => setEditing({ challenge: c })}
                    onDelete={() => setDeleting(c)}
                    onEnd={() => setEnding(c)}
                  />
                ))}
              </ul>
            </section>
          ) : (
            !editing && (
              <EmptyState
                icon={Trophy}
                title="Nenhum desafio ainda"
                description="Marque um desafio de check-in com foto, água, passos, nutrição ou pontos."
              />
            )
          )}
        </div>

        <aside className="space-y-4">
          {canReview && <ReviewQueue groupId={g.id} />}
          <section className="space-y-1.5 rounded-card bg-muted p-4">
            <h2 className="text-sm font-semibold">Como o membro vê</h2>
            <p className="text-xs text-muted-foreground">
              Participante: atividade, ranking e regras. Quem não participa: ranking e regras, sem
              fotos. Água, passos e nutrição mostram só os dias, nunca ml, passos ou gramas. A foto
              do check-in só a pessoa e a equipe veem.
            </p>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={`Encerrar ${ending?.title ?? 'o desafio'}?`}
        description="O ranking fecha com o que foi registrado até agora. As medalhas saem depois que a fila de revisão esvaziar. Não dá para reabrir."
        confirmLabel="Encerrar"
        pendingLabel="Encerrando..."
        pending={end.isPending}
        onConfirm={() => ending && end.mutate(ending.id)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Apagar ${deleting?.title ?? 'o desafio'}?`}
        description="Ele ainda não começou: quem já entrou deixa de ver o desafio."
        confirmLabel="Apagar"
        pendingLabel="Apagando..."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}

function rowSubtitle(c: Challenge): string {
  const table = c.rules.pointsTable;
  const what =
    c.kind === 'POINTS' && table
      ? POINT_ITEMS.filter((i) => (table[i] ?? 0) > 0)
          .map((i) => `${POINT_ITEM_INFO[i].label.toLowerCase()} ${table[i]}`)
          .join(', ')
      : kindShortLabel(c);
  return [what, challengePeriod(c), peopleLabel(c.participants)].join(' · ');
}

function ChallengeRow({
  c,
  onEdit,
  onDelete,
  onEnd,
}: {
  c: Challenge;
  onEdit: () => void;
  onDelete: () => void;
  onEnd: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card bg-card p-4">
      <KindIcon kind={c.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{c.title}</span>
          <ChallengeStatusBadge challenge={c} />
          {c.resultPending && <Badge variant="lite">resultado em revisão</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{rowSubtitle(c)}</p>
      </div>
      {c.canManage && c.status !== 'ended' && (
        <div className="flex flex-wrap gap-2">
          {c.status === 'upcoming' ? (
            <>
              <Button size="sm" variant="outline" onClick={onEdit}>
                Editar
              </Button>
              <Button size="sm" variant="outline" className="text-danger" onClick={onDelete}>
                Apagar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onEnd}>
              Encerrar agora
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-9 text-lg"
        aria-label={`Menos ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <span aria-hidden>−</span>
      </Button>
      <span className="w-16 text-center text-sm font-semibold tabular-nums">
        {value === 0 ? 'não conta' : value === 1 ? '1 pt' : `${value} pts`}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-9"
        aria-label={`Mais ${label}`}
        disabled={value >= POINT_VALUE_MAX}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size={16} />
      </Button>
    </div>
  );
}

function ReadOnlyList({ label, rows }: { label: string; rows: [string, string][] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <ul aria-label={label} className="space-y-2 rounded-xl border border-subtle p-3">
        {rows.map(([t, d]) => (
          <li key={t} className="flex items-start gap-2.5">
            <Icon name="lock" size={14} className="mt-1 text-muted-foreground" />
            <span>
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-xs text-muted-foreground">{d}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChallengeForm({
  challenge,
  today,
  pending,
  onCancel,
  onSave,
}: {
  challenge: Challenge | null;
  today: string;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: ChallengeInput) => void;
}) {
  const [d, setD] = useState<Draft>(() => draftOf(challenge, today));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((old) => ({ ...old, [k]: v }));
  const input = inputOf(d);
  const problem = challengeProblem(input, today) ?? rangeProblem(d, input);
  const sum = POINT_ITEMS.reduce((s, i) => s + d.points[i], 0);
  const editing = challenge !== null;

  return (
    <form
      aria-labelledby="form-desafio"
      className="space-y-5 rounded-card bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSave(input);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="form-desafio" className="font-semibold">
          {editing ? 'Editar desafio' : 'Novo desafio'}
        </h2>
        <span className="text-xs text-muted-foreground">{FORM_KIND_INFO[d.kind].explain}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
        <div className="space-y-1">
          <Label htmlFor="desafio-titulo">Título</Label>
          <Input
            id="desafio-titulo"
            value={d.title}
            maxLength={CHALLENGE_TITLE_MAX}
            placeholder="Ex.: 30 dias de treino"
            onChange={(e) => set('title', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desafio-inicio">Começa em</Label>
          <Input
            id="desafio-inicio"
            type="date"
            min={today}
            value={d.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desafio-fim">Termina em</Label>
          <Input
            id="desafio-fim"
            type="date"
            min={d.startDate || today}
            value={d.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">O que conta</legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {FORM_KINDS.map((k) => (
            <label
              key={k}
              className="flex cursor-pointer flex-col gap-1 rounded-xl border border-subtle p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tipo"
                  className="sr-only"
                  checked={d.kind === k}
                  onChange={() => set('kind', k)}
                />
                <KindIcon
                  kind={FORM_KIND_INFO[k].kind}
                  className="size-7 rounded-lg [&_svg]:size-4"
                />
                <span className="text-sm font-semibold">{FORM_KIND_INFO[k].label}</span>
              </span>
              <span className="text-xs text-muted-foreground">{FORM_KIND_INFO[k].explain}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {d.kind === 'POINTS' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Quanto vale cada coisa</p>
            <p className="text-xs text-muted-foreground">
              máximo por dia: <b className="text-foreground">{`${sum} pts`}</b>
            </p>
          </div>
          <ul className="divide-y divide-subtle rounded-xl border border-subtle">
            {POINT_ITEMS.map((i) => (
              <li
                key={i}
                className={cn(
                  'flex items-center gap-3 px-3 py-2',
                  d.points[i] === 0 && 'opacity-70',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{POINT_ITEM_INFO[i].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {POINT_ITEM_INFO[i].explain}
                  </span>
                </span>
                <Stepper
                  label={POINT_ITEM_INFO[i].label}
                  value={d.points[i]}
                  onChange={(v) => set('points', { ...d.points, [i]: v })}
                />
              </li>
            ))}
          </ul>
          <div className="max-w-xs space-y-1">
            <Label htmlFor="desafio-max-pontos">Máximo de pontos por dia</Label>
            <Input
              id="desafio-max-pontos"
              type="number"
              inputMode="numeric"
              min={1}
              max={25}
              value={d.maxOverride ?? sum}
              onChange={(e) =>
                set('maxOverride', e.target.value === '' ? null : Number(e.target.value))
              }
            />
            <p className="text-xs text-muted-foreground">
              {`A tabela soma ${sum}. Um teto menor faz o dia completo valer menos.`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada item segue as regras do próprio tipo: o treino precisa do check-in com foto, os
            passos precisam vir do celular ou relógio, e a água conta até 4 L.
          </p>
        </div>
      )}

      {d.kind === 'WATER' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="desafio-agua-meta">Meta de água por dia (L)</Label>
            <Input
              id="desafio-agua-meta"
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0.5}
              max={6}
              value={d.waterGoal}
              onChange={(e) => set('waterGoal', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="desafio-agua-teto">Conta até (L)</Label>
            <Input
              id="desafio-agua-teto"
              type="number"
              inputMode="decimal"
              step={0.5}
              min={1}
              max={8}
              value={d.waterCap}
              onChange={(e) => set('waterCap', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Acima disso o dia não soma.</p>
          </div>
        </div>
      )}

      {d.kind === 'STEPS' && (
        <div className="space-y-3">
          <div className="max-w-xs space-y-1">
            <Label htmlFor="desafio-passos">Passos por dia</Label>
            <Input
              id="desafio-passos"
              type="number"
              inputMode="numeric"
              step={1000}
              min={1000}
              max={50000}
              value={d.stepsGoal}
              onChange={(e) => set('stepsGoal', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              1 ponto por dia, não importa quanto passar.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Fontes de passos aceitas</p>
            <div className="flex flex-wrap gap-2">
              {COUNTING_SOURCES.map((s) => {
                const on = d.sources.includes(s);
                return (
                  <Chip
                    key={s}
                    selected={on}
                    onClick={() =>
                      set('sources', on ? d.sources.filter((x) => x !== s) : [...d.sources, s])
                    }
                  >
                    {STEP_SOURCE_LABEL[s]}
                  </Chip>
                );
              })}
              <Chip disabled className="opacity-60">
                {`${STEP_SOURCE_LABEL.MANUAL} · não conta`}
              </Chip>
            </div>
          </div>
        </div>
      )}

      {d.kind === 'NUTRITION' && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Qual meta</p>
          <Segmented<ChallengeMetric>
            label="Qual meta"
            options={[
              { value: 'PROTEIN_TARGET_DAYS', label: 'Dias batendo proteína' },
              { value: 'KCAL_IN_RANGE_DAYS', label: 'Dias na faixa de calorias' },
            ]}
            value={d.nutrition}
            onChange={(m) => set('nutrition', m)}
          />
          <p className="text-xs text-muted-foreground">
            Cada pessoa compete contra a própria meta. Não existe desafio de “menos calorias” nem de
            perda de peso.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ReadOnlyList label="Contra trapaça" rows={ANTI_CHEAT[d.kind]} />
        <ReadOnlyList label="Quem vê o quê" rows={whoSeesWhat(d.kind, d.points)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="desafio-descricao">Descrição (opcional)</Label>
        <Textarea
          id="desafio-descricao"
          rows={3}
          maxLength={CHALLENGE_DESCRIPTION_MAX}
          value={d.description}
          placeholder="Regras da casa, prêmio, recado da equipe."
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      {problem && d.title.trim() !== '' && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={Boolean(problem) || pending}>
          {pending ? 'Salvando...' : editing ? 'Salvar' : 'Agendar desafio'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          Quem pedir “Me avise” e quem já entrou recebem um aviso quando começar.
        </span>
      </div>
    </form>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

function reviewWhen(item: ReviewItem): string {
  const day = challengePeriod({ startDate: item.date, endDate: item.date });
  if (!item.capturedAt) return day;
  const t = new Date(item.capturedAt);
  return `${day} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

const REVIEW_TYPE_LABEL: Record<ReviewItem['type'], string> = {
  photo: 'foto',
  water: 'água',
  steps: 'passos',
};

function ReviewRow({
  groupId,
  item,
  onDone,
}: {
  groupId: string;
  item: ReviewItem;
  onDone: () => void;
}) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= REVIEW_REASON_MIN && trimmed.length <= REVIEW_REASON_MAX;
  const resolve = useMutation({
    mutationFn: (input: { decision: 'valid' } | { decision: 'void'; reason: string }) =>
      challengesApi.resolve(groupId, item.challengeId, item.id, input),
    onSuccess: (r) => {
      toast(
        r.status === 'valid' ? 'Check-in validado.' : `${item.displayName} vai receber o motivo.`,
      );
      onDone();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para decidir agora.')),
  });
  const who =
    item.flags > 0
      ? `sinalizado por ${item.flags} ${item.flags === 1 ? 'participante' : 'participantes'}`
      : 'sinalizado pelo sistema';
  const workout =
    item.type === 'photo' ? (item.workoutLinked ? 'treino ligado' : 'sem treino ligado') : null;
  return (
    <li className="space-y-2.5 border-t border-subtle pt-3 first:border-t-0 first:pt-0">
      <div className="flex gap-3">
        {item.type === 'photo' && item.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, só para a equipe.
          <img
            src={item.photoUrl}
            alt={`Foto do check-in de ${item.displayName}`}
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <KindIcon kind={item.challengeKind} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{`${item.displayName} · ${reviewWhen(item)}`}</p>
          <p className="text-xs text-muted-foreground">
            {`${item.challengeTitle} · ${REVIEW_TYPE_LABEL[item.type]}${item.points ? ` +${item.points}` : ''}`}
          </p>
          {item.why && <p className="text-sm">{item.why}</p>}
          {item.caption && <p className="text-xs italic text-muted-foreground">{item.caption}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{[who, workout].filter(Boolean).join(' · ')}</p>
      {voiding ? (
        <div className="space-y-2">
          <Label htmlFor={`motivo-${item.id}`}>Motivo (a pessoa recebe)</Label>
          <Textarea
            id={`motivo-${item.id}`}
            rows={2}
            maxLength={REVIEW_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: a foto é de outro dia."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={!reasonOk || resolve.isPending}
              onClick={() => resolve.mutate({ decision: 'void', reason: trimmed })}
            >
              Anular com motivo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>
              Cancelar
            </Button>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {`${trimmed.length}/${REVIEW_REASON_MAX}`}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ decision: 'valid' })}
          >
            Vale
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolve.isPending}
            onClick={() => setVoiding(true)}
          >
            Anular
          </Button>
        </div>
      )}
    </li>
  );
}

/** A fila "Para revisar" (Pn-13): só a equipe que revisa vê; foto só aqui. */
function ReviewQueue({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: orgKeys.challengeReview(groupId),
    queryFn: () => challengesApi.reviewQueue(groupId),
  });
  const done = () => {
    void qc.invalidateQueries({ queryKey: orgKeys.challengeReview(groupId) });
    void qc.invalidateQueries({ queryKey: communityKeys.challenges(groupId), exact: true });
  };
  const open = queue.data?.open ?? 0;
  return (
    <section aria-labelledby="para-revisar" className="space-y-3 rounded-card bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="para-revisar" className="font-semibold">
          Para revisar
        </h2>
        {queue.data && (
          <Badge variant={open ? 'lite' : 'done'}>
            {open ? `${open} para decidir` : 'fila vazia'}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Enquanto ninguém decide, o ponto fica pendente. Se for anulado, a pessoa recebe o motivo. Só
        ela e a equipe veem esta fila.
      </p>
      {queue.isPending && <Skeleton className="h-20 rounded-xl" />}
      {queue.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar a fila.{' '}
          <button type="button" className="underline" onClick={() => queue.refetch()}>
            Tentar de novo
          </button>
        </p>
      )}
      {queue.data && queue.data.open >= queue.data.limit && (
        <p className="text-xs text-warning">
          {`A fila chegou a ${queue.data.limit}. Novas sinalizações esperam até a equipe decidir as que estão aqui.`}
        </p>
      )}
      {queue.data && queue.data.items.length > 0 && (
        <ul className="space-y-3">
          {queue.data.items.map((item) => (
            <ReviewRow key={item.id} groupId={groupId} item={item} onDone={done} />
          ))}
        </ul>
      )}
    </section>
  );
}

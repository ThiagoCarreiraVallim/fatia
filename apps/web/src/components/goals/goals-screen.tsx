'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GOAL_KIND_ICONS,
  goalIconTone,
  GOAL_TABS,
  GOALS_FOOTER,
  goalBadge,
  goalDeadlineIso,
  goalKindOption,
  goalProgress,
  goalSubtitle,
  goalTab,
  goalsApi,
  localDateKey,
  type Goal,
  type GoalTab,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { headerButtonClass } from '@/components/layout/tab-header';
import { ProgressBar, ToneBadge } from '@/components/progress/progress-ui';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { NewGoalSheet } from './new-goal-sheet';

type Pending = { action: 'complete' | 'archive' | 'delete'; goal: Goal } | null;

const CONFIRM = {
  complete: {
    title: 'Concluir meta?',
    description: 'Ela vai para Concluídas, com a data de hoje.',
    label: 'Concluir',
    pending: 'Concluindo...',
    icon: 'check' as IconName,
    tone: 'default' as const,
  },
  archive: {
    title: 'Arquivar meta?',
    description: 'Ela sai das ativas e para de acompanhar o progresso.',
    label: 'Arquivar',
    pending: 'Arquivando...',
    icon: 'file' as IconName,
    tone: 'default' as const,
  },
  delete: {
    title: 'Apagar meta?',
    description: 'Essa ação não pode ser desfeita.',
    label: 'Apagar',
    pending: 'Apagando...',
    icon: 'trash' as IconName,
    tone: 'danger' as const,
  },
};

/**
 * Metas (prancha Al-G9, #382): Ativas, Concluídas e Arquivadas. A meta com o prazo vencido
 * fica nas ativas, com "prazo passou" e a opção de um novo prazo.
 */
export function GoalsScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<GoalTab>('active');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [rescheduling, setRescheduling] = useState<Goal | null>(null);
  const [reporting, setReporting] = useState<Goal | null>(null);

  const query = useQuery({ queryKey: ['goals', 'all'], queryFn: () => goalsApi.list() });
  const goals = (query.data ?? []).filter((g) => goalTab(g) === tab);

  const act = useMutation({
    mutationFn: ({ action, goal }: NonNullable<Pending>): Promise<unknown> =>
      action === 'complete'
        ? goalsApi.complete(goal.id)
        : action === 'archive'
          ? goalsApi.update(goal.id, { status: 'archived' })
          : goalsApi.delete(goal.id),
    onSuccess: () => {
      setPending(null);
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      <TopBarActions>
        <button
          type="button"
          aria-label="Nova meta"
          onClick={() => setCreating(true)}
          className={headerButtonClass('lime')}
        >
          <Icon name="plus" />
        </button>
      </TopBarActions>

      <Segmented label="Metas" options={GOAL_TABS} value={tab} onChange={setTab} />

      {query.isError && (
        <ErrorState
          message="Não deu para carregar as metas."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isLoading && <Skeleton className="h-[260px] rounded-card" />}

      {query.data && goals.length === 0 && (
        <div className="flex flex-col items-center gap-1 rounded-card bg-card px-6 py-10 text-center">
          <Icon name="target" size={28} className="text-muted-foreground" />
          <span className="mt-2 font-bold">Nada aqui</span>
          <span className="text-[13px] text-muted-foreground">
            {tab === 'active'
              ? 'Crie uma meta no + lá em cima.'
              : 'As metas aparecem aqui quando mudam de estado.'}
          </span>
        </div>
      )}

      {query.data && goals.length > 0 && (
        <ul aria-label="Metas" className="flex flex-col gap-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              busy={act.isPending && act.variables?.goal.id === g.id}
              onComplete={() => setPending({ action: 'complete', goal: g })}
              onArchive={() => setPending({ action: 'archive', goal: g })}
              onDelete={() => setPending({ action: 'delete', goal: g })}
              onReschedule={() => setRescheduling(g)}
              onReport={() => setReporting(g)}
            />
          ))}
        </ul>
      )}

      <p className="px-1 text-[13px] text-muted-foreground">{GOALS_FOOTER}</p>

      <NewGoalSheet open={creating} onOpenChange={setCreating} />

      {pending && (
        <ConfirmSheet
          open
          onOpenChange={(o) => {
            if (!o) setPending(null);
          }}
          title={CONFIRM[pending.action].title}
          description={`"${pending.goal.title}". ${CONFIRM[pending.action].description}`}
          icon={CONFIRM[pending.action].icon}
          tone={CONFIRM[pending.action].tone}
          confirmLabel={CONFIRM[pending.action].label}
          pendingLabel={CONFIRM[pending.action].pending}
          pending={act.isPending}
          onConfirm={() => act.mutate(pending)}
        />
      )}

      <RescheduleSheet goal={rescheduling} onClose={() => setRescheduling(null)} />
      <ReportSheet goal={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}

function GoalCard({
  goal,
  busy,
  onComplete,
  onArchive,
  onDelete,
  onReschedule,
  onReport,
}: {
  goal: Goal;
  busy: boolean;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReschedule: () => void;
  onReport: () => void;
}) {
  // % de gordura (até a #383) e "Outra" não se atualizam sozinhas: a pessoa marca.
  const manual = !goalKindOption(goal.kind).auto;
  const badge = goalBadge(goal);
  const expired = goal.status === 'expired';
  const percent = goalProgress(goal);
  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-card bg-card p-4',
        expired && 'shadow-[inset_0_0_0_1.5px_hsl(var(--warning)/0.6)]',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]',
            goalIconTone(goal.kind) === 'steps'
              ? 'bg-[hsl(var(--warning)/0.14)] text-steps'
              : 'bg-primary-soft text-primary-text',
          )}
        >
          <Icon name={GOAL_KIND_ICONS[goal.kind] as IconName} size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{goal.title}</span>
          <span className="truncate text-[12px] text-muted-foreground">{goalSubtitle(goal)}</span>
        </div>
        <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>
      </div>
      <ProgressBar
        percent={percent}
        colorClass={expired ? 'bg-warning' : 'bg-primary'}
        label={`${goal.title}: ${percent}%`}
      />
      {(goal.status === 'active' || expired) && (
        <div className="flex gap-2">
          {expired ? (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-muted"
              disabled={busy}
              onClick={onReschedule}
              aria-label={`Novo prazo para ${goal.title}`}
            >
              <Icon name="repeat" size={16} />
              Novo prazo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-muted"
              disabled={busy}
              onClick={onComplete}
              aria-label={`Concluir ${goal.title}`}
            >
              <Icon name="check" size={16} />
              Concluir
            </Button>
          )}
          {manual && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-muted"
              disabled={busy}
              onClick={onReport}
              aria-label={`Atualizar ${goal.title}`}
            >
              Atualizar
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 bg-muted"
            disabled={busy}
            onClick={onArchive}
            aria-label={`Arquivar ${goal.title}`}
          >
            Arquivar
          </Button>
        </div>
      )}
      {goal.status === 'archived' && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start text-danger"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Apagar ${goal.title}`}
        >
          Apagar
        </Button>
      )}
    </li>
  );
}

/** "Novo prazo" de uma meta vencida: a data é o fim do dia, no fuso de quem escolhe. */
function RescheduleSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [today] = useState(() => localDateKey(new Date()));
  const [date, setDate] = useState('');
  const save = useMutation({
    mutationFn: ({ id, day }: { id: string; day: string }) =>
      goalsApi.update(id, { deadline: goalDeadlineIso(day) }),
    onSuccess: () => {
      setDate('');
      onClose();
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
  return (
    <Drawer
      open={goal !== null}
      onOpenChange={(o) => {
        if (!o) {
          setDate('');
          onClose();
        }
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Novo prazo</DrawerTitle>
          <DrawerDescription>
            {goal ? `"${goal.title}" volta para as ativas.` : ''}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3">
          <label htmlFor="goal-deadline" className="sr-only">
            Novo prazo
          </label>
          <Input
            id="goal-deadline"
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {save.isError && (
            <p className="text-sm text-danger">Não deu para salvar. Tente de novo.</p>
          )}
          <Button
            disabled={!date || date < today || save.isPending}
            onClick={() => goal && save.mutate({ id: goal.id, day: date })}
          >
            {save.isPending ? 'Salvando...' : 'Salvar prazo'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** "Atualizar" de uma meta marcada à mão: o valor de agora vira o progresso. */
function ReportSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const save = useMutation({
    mutationFn: ({ id, v }: { id: string; v: number }) =>
      goalsApi.update(id, { lastReportedValue: v }),
    onSuccess: () => {
      setValue('');
      onClose();
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
  const n = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0;
  return (
    <Drawer
      open={goal !== null}
      onOpenChange={(o) => {
        if (!o) {
          setValue('');
          onClose();
        }
      }}
    >
      <DrawerContent className="px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Atualizar meta</DrawerTitle>
          <DrawerDescription>
            {goal
              ? `"${goal.title}": alvo ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}.`
              : ''}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-3">
          <label htmlFor="goal-report" className="text-sm font-medium">
            Valor de agora
          </label>
          <Input
            id="goal-report"
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {save.isError && (
            <p className="text-sm text-danger">Não deu para salvar. Tente de novo.</p>
          )}
          <Button
            disabled={!valid || save.isPending}
            onClick={() => goal && save.mutate({ id: goal.id, v: n })}
          >
            {save.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

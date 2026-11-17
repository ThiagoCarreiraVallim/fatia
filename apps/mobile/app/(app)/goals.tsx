import { useState } from 'react';
import { View } from 'react-native';
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
  parseDayInput,
  type Goal,
  type GoalTab,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Screen } from '@/components/layout/screen';
import { HeaderButton } from '@/components/layout/tab-header';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
  ErrorState,
  FormMessage,
  LoadingState,
  Segmented,
  cn,
  useConfirm,
} from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { NewGoalSheet } from '@/components/goals/new-goal-sheet';
import { ProgressBar, ToneBadge } from '@/components/progress/progress-ui';
import { SheetField } from '@/components/progress/sheet-field';
import { parseAmount } from '@/components/progress/parse';
import { colors } from '@/theme/colors';

/**
 * Metas (pranchas Al-G9 e Al-G10, #382) — réplica de
 * `apps/web/src/components/goals/goals-screen.tsx`. A meta vencida fica nas ativas,
 * com "prazo passou" e a opção de um novo prazo.
 */
export default function GoalsScreen() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<GoalTab>('active');
  const [creating, setCreating] = useState(false);
  const [rescheduling, setRescheduling] = useState<Goal | null>(null);
  const [reporting, setReporting] = useState<Goal | null>(null);

  const query = useQuery({ queryKey: ['goals', 'all'], queryFn: () => goalsApi.list() });
  const goals = (query.data ?? []).filter((g) => goalTab(g) === tab);

  const act = useMutation({
    mutationFn: ({
      action,
      goal,
    }: {
      action: 'complete' | 'archive' | 'delete';
      goal: Goal;
    }): Promise<unknown> =>
      action === 'complete'
        ? goalsApi.complete(goal.id)
        : action === 'archive'
          ? goalsApi.update(goal.id, { status: 'archived' })
          : goalsApi.delete(goal.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  const ask = (action: 'complete' | 'archive' | 'delete', goal: Goal) =>
    confirm({
      title:
        action === 'complete'
          ? 'Concluir meta?'
          : action === 'archive'
            ? 'Arquivar meta?'
            : 'Apagar meta?',
      description: `"${goal.title}". ${
        action === 'complete'
          ? 'Ela vai para Concluídas, com a data de hoje.'
          : action === 'archive'
            ? 'Ela sai das ativas e para de acompanhar o progresso.'
            : 'Essa ação não pode ser desfeita.'
      }`,
      confirmLabel:
        action === 'complete' ? 'Concluir' : action === 'archive' ? 'Arquivar' : 'Apagar',
      destructive: action === 'delete',
      onConfirm: () => act.mutate({ action, goal }),
    });

  return (
    <>
      <Screen
        actions={
          <HeaderButton label="Nova meta" variant="lime" onPress={() => setCreating(true)}>
            <Icon name="plus" color={colors.primaryForeground} />
          </HeaderButton>
        }
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching}
      >
        <View className="gap-3 px-4 pb-8 pt-2">
          <Segmented label="Metas" options={GOAL_TABS} value={tab} onChange={setTab} />

          {query.isLoading ? <LoadingState label="Carregando metas…" /> : null}
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : null}

          {query.data && goals.length === 0 ? (
            <View className="items-center gap-1 rounded-card bg-card px-6 py-10">
              <Icon name="target" size={28} color={colors.mutedForeground} />
              <Text className="mt-2 font-sans-bold text-foreground">Nada aqui</Text>
              <Text className="text-center text-[13px] text-muted-foreground">
                {tab === 'active'
                  ? 'Crie uma meta no + lá em cima.'
                  : 'As metas aparecem aqui quando mudam de estado.'}
              </Text>
            </View>
          ) : null}

          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              busy={act.isPending && act.variables?.goal.id === g.id}
              onComplete={() => ask('complete', g)}
              onArchive={() => ask('archive', g)}
              onDelete={() => ask('delete', g)}
              onReschedule={() => setRescheduling(g)}
              onReport={() => setReporting(g)}
            />
          ))}

          <Text className="px-1 text-[13px] text-muted-foreground">{GOALS_FOOTER}</Text>
        </View>
      </Screen>

      {/* Fora do `Screen`: dentro do ScrollView a folha acompanharia o conteúdo rolado. */}
      <DrawerLayer>
        <NewGoalSheet open={creating} onClose={() => setCreating(false)} />
        <RescheduleSheet goal={rescheduling} onClose={() => setRescheduling(null)} />
        <ReportSheet goal={reporting} onClose={() => setReporting(null)} />
      </DrawerLayer>
    </>
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
  const badge = goalBadge(goal);
  const expired = goal.status === 'expired';
  const percent = goalProgress(goal);
  // % de gordura (até a #383) e "Outra" não se atualizam sozinhas: a pessoa marca.
  const manual = !goalKindOption(goal.kind).auto;
  return (
    <View
      className={cn(
        'gap-3 rounded-card bg-card p-4',
        expired && 'border-[1.5px] border-warning/60',
      )}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-[14px]',
            goalIconTone(goal.kind) === 'steps' ? 'bg-warning/15' : 'bg-primary/10',
          )}
        >
          <Icon
            name={GOAL_KIND_ICONS[goal.kind] as IconName}
            size={18}
            color={goalIconTone(goal.kind) === 'steps' ? colors.steps : colors.primaryText}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-foreground" numberOfLines={1}>
            {goal.title}
          </Text>
          <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
            {goalSubtitle(goal)}
          </Text>
        </View>
        <ToneBadge tone={badge.tone} label={badge.label} />
      </View>
      <ProgressBar
        percent={percent}
        color={expired ? colors.warning : colors.primary}
        label={`${goal.title}: ${percent}%`}
      />
      {goal.status === 'active' || expired ? (
        <View className="flex-row gap-2">
          {expired ? (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onPress={onReschedule}
            >
              <ActionLabel icon="repeat" label="Novo prazo" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onPress={onComplete}
            >
              <ActionLabel icon="check" label="Concluir" />
            </Button>
          )}
          {manual ? (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onPress={onReport}
            >
              Atualizar
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onPress={onArchive}
          >
            Arquivar
          </Button>
        </View>
      ) : null}
      {goal.status === 'archived' ? (
        <Button
          size="sm"
          variant="danger"
          className="self-start"
          disabled={busy}
          onPress={onDelete}
        >
          Apagar
        </Button>
      ) : null}
    </View>
  );
}

/** Ícone e texto do botão da meta (o `.btn sm` com ícone da prancha Al-G9). */
function ActionLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={16} color={colors.foreground} />
      <Text className="text-xs font-semibold text-secondary-foreground">{label}</Text>
    </View>
  );
}

/** "Novo prazo" de uma meta vencida. Sem calendário nativo: data digitada (DD/MM/AAAA). */
function RescheduleSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const [today] = useState(() => localDateKey(new Date()));
  const day = parseDayInput(typed);
  const past = day !== null && day < today;
  const save = useMutation({
    mutationFn: ({ id, d }: { id: string; d: string }) =>
      goalsApi.update(id, { deadline: goalDeadlineIso(d) }),
    onSuccess: () => {
      setTyped('');
      onClose();
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
  return (
    <Drawer
      open={goal !== null}
      onOpenChange={(next) => {
        if (!next) {
          setTyped('');
          onClose();
        }
      }}
      snapPoints={['85%']}
    >
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Novo prazo</DrawerTitle>
          <DrawerDescription>
            {goal ? `"${goal.title}" volta para as ativas.` : ''}
          </DrawerDescription>
        </DrawerHeader>
        <View className="gap-3 py-2">
          <SheetField
            label="Novo prazo"
            value={typed}
            onChangeText={setTyped}
            placeholder="DD/MM/AAAA"
            keyboardType="numbers-and-punctuation"
            error={
              typed && day === null
                ? 'Use o formato DD/MM/AAAA.'
                : past
                  ? 'O prazo precisa ser hoje ou depois.'
                  : null
            }
          />
          {save.isError ? <FormMessage>Não deu para salvar. Tente de novo.</FormMessage> : null}
        </View>
        <DrawerFooter className="px-0 pb-8">
          <Button
            disabled={day === null || past}
            loading={save.isPending}
            onPress={() => goal && day && save.mutate({ id: goal.id, d: day })}
          >
            Salvar prazo
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** "Atualizar" de uma meta marcada à mão: o valor de agora vira o progresso. */
function ReportSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const n = parseAmount(value);
  const save = useMutation({
    mutationFn: ({ id, v }: { id: string; v: number }) =>
      goalsApi.update(id, { lastReportedValue: v }),
    onSuccess: () => {
      setValue('');
      onClose();
      return qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
  return (
    <Drawer
      open={goal !== null}
      onOpenChange={(next) => {
        if (!next) {
          setValue('');
          onClose();
        }
      }}
      snapPoints={['85%']}
    >
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>Atualizar meta</DrawerTitle>
          <DrawerDescription>
            {goal
              ? `"${goal.title}": alvo ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ''}.`
              : ''}
          </DrawerDescription>
        </DrawerHeader>
        <View className="gap-3 py-2">
          <SheetField
            label="Valor de agora"
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
          />
          {save.isError ? <FormMessage>Não deu para salvar. Tente de novo.</FormMessage> : null}
        </View>
        <DrawerFooter className="px-0 pb-8">
          <Button
            disabled={n === null || n < 0}
            loading={save.isPending}
            onPress={() => goal && n !== null && save.mutate({ id: goal.id, v: n })}
          >
            Salvar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

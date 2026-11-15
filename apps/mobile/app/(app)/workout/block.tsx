import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, RotateCcw } from 'lucide-react-native';
import {
  BLOCK_WEEK_OPTIONS,
  blockPlannerApi,
  blockWeekRows,
  workoutApi,
  type TrainingBlock,
  type TrainingBlockKind,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ErrorState, LoadingState, Segmented, cn, useConfirm } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { mensagemDeErro } from '@/components/nutrition/helpers';
import { useStartSession } from '@/components/workout/use-start-session';
import {
  activeWeekRows,
  BLOCK_KIND_OPTIONS,
  blockScreenState,
  blockStatusCopy,
} from '@/components/workout/block-view';
import { colors } from '@/theme/colors';

/**
 * Bloco de treino (#379, prancha Al-T12; ADR 019). Réplica de
 * `apps/web/src/app/(app)/workout/block/page.tsx`. De 3 a 6 semanas, a última
 * de deload; o foco é força ou hipertrofia. Os três estados do bloco (#370):
 * em andamento destaca a semana atual, concluído resume, encerrado oferece
 * recomeçar.
 */

type WeekRow = ReturnType<typeof blockWeekRows>[number] & {
  current?: boolean;
  progress?: string;
};

const PILL = 'h-14 flex-1 items-center justify-center rounded-pill active:opacity-80';

export default function BlockScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const start = useStartSession();
  const [kind, setKind] = useState<TrainingBlockKind>('hypertrophy');
  const [weeks, setWeeks] = useState<number>(4);
  const [planId, setPlanId] = useState<string | undefined>(undefined);

  const latest = useQuery({
    queryKey: ['workout', 'block', 'latest'],
    queryFn: () => blockPlannerApi.latest(),
  });
  const state = latest.data === undefined ? null : blockScreenState(latest.data);
  const planning = state === 'plan' || state === 'completed' || state === 'abandoned';

  const preview = useQuery({
    queryKey: ['workout', 'block', 'preview', kind, weeks],
    queryFn: () => blockPlannerApi.preview({ kind, weeks }),
    enabled: planning,
    placeholderData: keepPreviousData,
  });
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: planning,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['workout', 'block'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const create = useMutation({
    mutationFn: () => blockPlannerApi.create({ kind, weeks, planId }),
    onSuccess: () => {
      refresh();
      router.navigate('/workout' as Href);
    },
  });
  const end = useMutation({
    mutationFn: (id: string) => workoutApi.deleteBlock(id),
    onSuccess: refresh,
  });

  const active = state === 'active' ? (latest.data as TrainingBlock) : null;

  const footer = planning ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: create.isPending }}
      disabled={create.isPending}
      onPress={() => create.mutate()}
      className={cn(PILL, 'bg-primary', create.isPending && 'opacity-40')}
    >
      <Text className="font-sans-bold text-[15px] text-primary-foreground">
        {create.isPending ? 'Começando…' : `Começar bloco de ${weeks} semanas`}
      </Text>
    </Pressable>
  ) : active?.planId && active.planName ? (
    <Pressable
      accessibilityRole="button"
      disabled={start.isPending}
      onPress={() => start.mutate({ planId: active.planId })}
      className={cn(PILL, 'bg-primary', start.isPending && 'opacity-40')}
    >
      <Text className="font-sans-bold text-[15px] text-primary-foreground">
        Começar {active.planName}
      </Text>
    </Pressable>
  ) : null;

  return (
    <Screen
      refreshing={latest.isRefetching}
      onRefresh={() => void latest.refetch()}
      footer={footer}
    >
      <View className="gap-5 px-5 pt-2">
        {latest.isLoading ? <LoadingState /> : null}
        {latest.isError ? (
          <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />
        ) : null}

        {active ? (
          <>
            <View className="gap-1">
              <Text className="font-display-semibold text-[22px] text-foreground">
                {[active.kindLabel, active.planName].filter(Boolean).join(' · ')}
              </Text>
              {active.currentWeek ? (
                <Text className="text-sm text-muted-foreground">
                  Semana {active.currentWeek.weekNumber} de {active.weeksTotal}
                  {active.currentWeek.summary ? ` · ${active.currentWeek.summary}` : ''}
                </Text>
              ) : null}
            </View>
            <WeekChart rows={activeWeekRows(active)} />
            <WeekList rows={activeWeekRows(active)} />
            {active.explanation ? (
              <Text className="text-xs text-faint">{active.explanation}</Text>
            ) : null}
            <Button
              variant="danger"
              size="xs"
              className="self-start"
              loading={end.isPending}
              onPress={() =>
                confirm({
                  title: 'Encerrar o bloco?',
                  description:
                    'O histórico dos treinos continua. Você pode montar outro bloco depois.',
                  confirmLabel: 'Encerrar',
                  destructive: true,
                  onConfirm: () => end.mutate(active.id),
                })
              }
            >
              Encerrar bloco
            </Button>
          </>
        ) : null}

        {latest.data && (state === 'completed' || state === 'abandoned') ? (
          <StatusCard block={latest.data} />
        ) : null}

        {planning ? (
          <>
            <Segmented
              label="Foco do bloco"
              options={BLOCK_KIND_OPTIONS}
              value={kind}
              onChange={setKind}
            />

            <View className="gap-2">
              <Text className="font-sans-bold text-sm text-foreground">
                Semanas <Text className="text-xs text-faint">· a última é de deload</Text>
              </Text>
              <View accessibilityRole="radiogroup" className="flex-row gap-2">
                {BLOCK_WEEK_OPTIONS.map((n) => {
                  const on = n === weeks;
                  return (
                    <Pressable
                      key={n}
                      accessibilityRole="radio"
                      accessibilityLabel={`${n} semanas`}
                      accessibilityState={{ checked: on }}
                      onPress={() => setWeeks(n)}
                      className={cn(
                        'h-11 w-12 items-center justify-center rounded-pill',
                        on ? 'bg-foreground' : 'bg-card',
                      )}
                    >
                      <Text
                        className={cn(
                          'font-sans-bold text-[15px]',
                          on ? 'text-background' : 'text-foreground',
                        )}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {plans.data && plans.data.length > 0 ? (
              <View className="gap-2">
                <Text className="font-sans-bold text-sm text-foreground">Plano do bloco</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="-mx-5"
                  contentContainerClassName="gap-2 px-5"
                >
                  {[{ id: undefined, name: 'Treino livre' }, ...plans.data].map((p) => {
                    const on = planId === p.id;
                    return (
                      <Pressable
                        key={p.id ?? 'livre'}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setPlanId(p.id)}
                        className={cn(
                          'min-h-9 justify-center rounded-pill px-4',
                          on ? 'bg-foreground' : 'bg-card',
                        )}
                      >
                        <Text
                          className={cn(
                            'font-sans-semibold text-[13px]',
                            on ? 'text-background' : 'text-foreground',
                          )}
                        >
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {preview.isError ? (
              <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
            ) : null}
            {preview.data ? (
              <>
                <WeekChart rows={blockWeekRows(preview.data.weeks)} />
                <WeekList rows={blockWeekRows(preview.data.weeks)} />
              </>
            ) : preview.isLoading ? (
              <LoadingState />
            ) : null}

            {create.error ? (
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {mensagemDeErro(create.error, {
                  conflito: 'Já existe um bloco em andamento.',
                  alternativa: 'Não deu para começar o bloco. Tente de novo.',
                })}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function StatusCard({ block }: { block: TrainingBlock }) {
  const copy = blockStatusCopy(block);
  const done = block.status === 'completed';
  return (
    <View className="flex-row gap-3 rounded-card bg-card p-4">
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: done ? `${colors.primary}26` : colors.muted }}
      >
        {done ? (
          <Flag size={16} color={colors.primaryText} />
        ) : (
          <RotateCcw size={16} color={colors.mutedForeground} />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans-bold text-[15px] text-foreground">{copy.title}</Text>
        <Text className="text-xs text-faint">{copy.body}</Text>
        <Text className="pt-1 text-xs text-primary-text">{copy.cta}: escolha abaixo.</Text>
      </View>
    </View>
  );
}

/** "Volume e intensidade": duas barras por semana, proporcionais ao maior fator. */
function WeekChart({ rows }: { rows: WeekRow[] }) {
  const H = 72;
  return (
    <View className="gap-2 rounded-card bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-bold text-sm text-foreground">Volume e intensidade</Text>
        <View className="flex-row items-center gap-3">
          <Legend color={colors.primary} label="volume" />
          <Legend color={colors.info} label="intensidade" />
        </View>
      </View>
      <View
        accessibilityLabel={rows
          .map((r) => `semana ${r.n}: volume ${r.volume}, intensidade ${r.intensity}`)
          .join('; ')}
        className="flex-row items-end gap-2"
        style={{ height: H }}
      >
        {rows.map((r) => (
          <View key={r.n} className="flex-1 flex-row items-end justify-center gap-1">
            <View
              className="w-2.5 rounded-t-[3px]"
              style={{
                height: Math.max(4, Math.round(r.volumeBar * H)),
                backgroundColor: colors.primary,
                opacity: r.current === false ? 0.5 : 1,
              }}
            />
            <View
              className="w-2.5 rounded-t-[3px]"
              style={{
                height: Math.max(4, Math.round(r.intensityBar * H)),
                backgroundColor: colors.info,
                opacity: r.current === false ? 0.5 : 1,
              }}
            />
          </View>
        ))}
      </View>
      <View className="flex-row gap-2">
        {rows.map((r) => (
          <Text key={r.n} className="flex-1 text-center text-[11px] text-faint">
            {r.n}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[11px] text-faint">{label}</Text>
    </View>
  );
}

function WeekList({ rows }: { rows: WeekRow[] }) {
  return (
    <View className="overflow-hidden rounded-card bg-card">
      {rows.map((r, i) => (
        <View
          key={r.n}
          accessibilityLabel={`Semana ${r.n}, ${r.label}${r.current ? ', semana atual' : ''}`}
          className={cn('flex-row items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border')}
          style={r.current ? { backgroundColor: `${colors.primary}14` } : undefined}
        >
          <View
            className={cn(
              'h-9 w-9 items-center justify-center rounded-[10px]',
              r.current ? 'bg-primary' : 'bg-muted',
            )}
          >
            <Text
              className={cn(
                'font-sans-bold text-sm',
                r.current ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {r.n}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className={cn('font-sans-bold text-sm', r.deload ? 'text-info' : 'text-foreground')}
            >
              {r.label}
              {r.current ? ' · agora' : ''}
            </Text>
            <Text className="text-xs text-faint">
              intensidade {r.intensity} · volume {r.volume}
            </Text>
          </View>
          <Text className="text-xs text-faint" style={{ fontVariant: ['tabular-nums'] }}>
            {r.progress ?? r.sessions}
          </Text>
        </View>
      ))}
    </View>
  );
}

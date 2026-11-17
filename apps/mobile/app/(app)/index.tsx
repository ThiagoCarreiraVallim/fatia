import { useCallback, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dayShareCard,
  dayShareMessage,
  goalsApi,
  goalsChipLabel,
  greetingLine,
  todayDateLine,
  INBOX_EMPTY_TOAST,
  progressApi,
  usersApi,
  waterAddedToast,
  WATER_GLASS_ML,
  whatsappShareUrl,
  type ShareTarget,
  type TodaySummary,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { headerButtonClass } from '@/components/layout/tab-header';
import { DrawerLayer, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { BodyLogSheet } from '@/components/progress';
import { ShareSheet } from '@/components/sharing/share-sheet';
import type { ShareIdentity } from '@/components/sharing/share-card';
import {
  EventCard,
  KcalCard,
  NextWorkoutCard,
  PersonalGoalsCard,
  ReceivedPlanBanner,
  StepsTile,
  StreakTile,
  TodoCard,
  WaterTile,
  WeightTile,
} from '@/components/today/today-cards';
import { FirstStepsCard } from '@/components/today/first-steps-card';
import { GoalsSheet } from '@/components/today/goals-sheet';
import { InboxSheet } from '@/components/today/inbox-sheet';
import { WaterSheet } from '@/components/today/water-sheet';
import { WeightSheet } from '@/components/today/weight-sheet';
import { colors } from '@/theme/colors';

/**
 * Hoje (prancha Al-H1-Hoje), espelho de `apps/web/src/app/(app)/page.tsx`.
 *
 * As folhas ficam aqui, irmãs do `<Screen>`, e não dentro dos cartões que as
 * abrem: o bottom sheet nativo não é portal e abriria com a altura do cartão,
 * rolando junto com o conteúdo. Ver `src/components/ui/drawer.tsx`.
 */

type Sheet = 'goals' | 'water' | 'weight' | 'steps' | 'share' | 'inbox' | null;

const DASHBOARD_KEY = ['dashboard', 'today'] as const;

function shareInput(data: TodaySummary) {
  return { ...data, streakDays: data.streak.activeDays.periodos };
}

export default function TodayScreen() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();

  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const today = useQuery({ queryKey: DASHBOARD_KEY, queryFn: () => progressApi.today() });
  // O `today()` só LÊ as conquistas; quem desbloqueia é esta chamada (ver a mesma nota no PWA).
  useQuery({
    queryKey: ['achievements', 'refresh'],
    queryFn: () => progressApi.refreshAchievements(),
  });
  const personal = useQuery({
    queryKey: ['goals', 'active'],
    queryFn: () => goalsApi.list({ status: 'active' }),
  });

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const data = today.data;
  const closeOn = (o: boolean) => {
    if (!o) setSheet(null);
  };

  // O "+" do cartão de água: um copo, e o total novo no toast.
  const addGlass = useMutation({
    mutationFn: () => progressApi.createWater({ ml: WATER_GLASS_ML }),
    onSuccess: () => {
      const total = (data?.water.todayMl ?? 0) + WATER_GLASS_ML;
      qc.setQueryData<TodaySummary>(DASHBOARD_KEY, (old) =>
        old ? { ...old, water: { ...old.water, todayMl: total } } : old,
      );
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['water-logs'] });
      toast.show({ message: waterAddedToast(WATER_GLASS_ML, total) });
    },
    onError: () => toast.show({ message: 'Não deu para registrar a água. Tente de novo.' }),
  });

  function openInbox() {
    if (!data || data.inbox.unread === 0) {
      toast.show({ message: INBOX_EMPTY_TOAST });
      return;
    }
    setSheet('inbox');
  }

  async function share(target: ShareTarget, identity: ShareIdentity) {
    if (!data) return;
    const text = dayShareMessage(
      dayShareCard(shareInput(data)),
      identity.as === 'none' ? null : identity.value,
    );
    setSheet(null);
    try {
      if (target === 'whatsapp' && (await Linking.canOpenURL(whatsappShareUrl(text)))) {
        await Linking.openURL(whatsappShareUrl(text));
        return;
      }
      await Share.share({ message: text });
    } catch {
      // A pessoa fechou a folha do sistema: nada a avisar.
    }
  }

  const goals = data?.dailyGoals;
  const unread = (data?.inbox.unread ?? 0) > 0;

  return (
    <>
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <View className="gap-4 px-6 pb-4 pt-2">
          {/* Topo (Al-H1): data e chip das metas, saudação, e o sino com ponto de não lido. */}
          <View className="mb-1.5 flex-row items-start gap-2">
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-b2 text-muted-foreground">{todayDateLine()}</Text>
                {goals && goals.total > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Metas do dia: ${goals.met} de ${goals.total}`}
                    onPress={() => setSheet('goals')}
                    className="h-7 flex-row items-center gap-1.5 rounded-chip bg-card px-2.5"
                  >
                    <Icon name="target" size={16} color={colors.primaryText} />
                    <Text className="text-xs font-semibold text-muted-foreground">
                      {goalsChipLabel(goals.met, goals.total)}
                    </Text>
                  </Pressable>
                ) : goals ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/nutrition/goals')}
                    className="h-7 flex-row items-center gap-1.5 rounded-chip bg-card px-2.5"
                  >
                    <Icon name="target" size={16} color={colors.primaryText} />
                    <Text className="text-xs font-semibold text-muted-foreground">
                      Definir metas
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text
                accessibilityRole="header"
                className="font-display text-[26px] leading-[30px] tracking-[-0.5px] text-foreground"
              >
                {greetingLine(me.data?.name)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unread ? 'Avisos, há avisos novos' : 'Avisos'}
              onPress={openInbox}
              hitSlop={4}
              className={headerButtonClass()}
            >
              <Icon name="bell" size={20} color={colors.foreground} />
              {unread ? (
                <View
                  className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand"
                  style={{ borderWidth: 2, borderColor: colors.card }}
                />
              ) : null}
            </Pressable>
          </View>

          {today.isLoading ? <LoadingState label="Carregando seu dia…" /> : null}

          {today.error ? (
            <ErrorState error={today.error} onRetry={() => today.refetch()} />
          ) : data ? (
            <>
              <FirstStepsCard />
              {data.receivedPlan ? <ReceivedPlanBanner plan={data.receivedPlan} /> : null}
              {data.todo.count > 0 ? <TodoCard todo={data.todo} /> : null}
              {data.nextEvent ? <EventCard event={data.nextEvent} /> : null}
              <KcalCard nutrition={data.nutrition} />
              <NextWorkoutCard workout={data.workout} />
              <View className="flex-row gap-3">
                <WaterTile
                  water={data.water}
                  onOpen={() => setSheet('water')}
                  onAdd={() => addGlass.mutate()}
                  adding={addGlass.isPending}
                />
                <StepsTile steps={data.steps} onOpen={() => setSheet('steps')} />
              </View>
              <View className="flex-row gap-3">
                <WeightTile weight={data.weight} onOpen={() => setSheet('weight')} />
                <StreakTile streak={data.streak} />
              </View>
              <PersonalGoalsCard goals={personal.data} loading={personal.isLoading} />
            </>
          ) : today.isLoading ? null : (
            <EmptyState
              title="Sem resumo para hoje"
              description="Puxe a tela para baixo para tentar de novo."
            />
          )}
        </View>
      </Screen>

      <DrawerLayer>
        {data ? (
          <>
            <GoalsSheet
              open={sheet === 'goals'}
              onOpenChange={closeOn}
              goals={data.dailyGoals}
              onWater={() => setSheet('water')}
              onSteps={() => setSheet('steps')}
              onShare={() => setSheet('share')}
            />
            <WaterSheet
              open={sheet === 'water'}
              onOpenChange={closeOn}
              targetMl={data.water.targetMl ?? 2500}
            />
            <ShareSheet
              open={sheet === 'share'}
              onOpenChange={closeOn}
              data={dayShareCard(shareInput(data))}
              person={{ name: me.data?.name ?? 'Você', handle: null }}
              onShare={(t, id) => void share(t, id)}
            />
          </>
        ) : null}
        <WeightSheet open={sheet === 'weight'} onOpenChange={closeOn} />
        <BodyLogSheet open={sheet === 'steps'} initialKind="steps" onClose={() => setSheet(null)} />
        <InboxSheet open={sheet === 'inbox'} onOpenChange={closeOn} />
      </DrawerLayer>
    </>
  );
}

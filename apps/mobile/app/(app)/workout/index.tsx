import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { CalendarDays, ChevronRight, Heart, History, Plus, Timer, Zap } from 'lucide-react-native';
import {
  blockRow,
  initialsOf,
  planCardInfo,
  planOffersApi,
  receivedOfferBanner,
  planExercisePreview,
  planMuscleBars,
  QUICK_TEMPLATES,
  trainingWeekLabel,
  workoutApi,
  type QuickTemplate,
  type TrainingWeek,
  type WorkoutPlan,
} from '@fatia/api-client';
import { WorkoutCardsCarousel } from '@/components/workout/cards/workout-cards';
import { Screen } from '@/components/layout/screen';
import { Carousel, ErrorState, LoadingState } from '@/components/ui';
import { BlockTimeline } from '@/components/workout/block-timeline';
import { quickVisual } from '@/components/workout/quick-template-visual';
import { groupColorName, weekChips } from '@/components/workout/workout-home';
import { colors } from '@/theme/colors';
import { HeaderButton, TabHeader } from '@/components/layout/tab-header';
import { cn } from '@/components/ui/utils';

/**
 * A aba Treino do redesign (prancha `Al-T1-Treino`, #377): a semana, os cards,
 * os planos da pessoa e os outros jeitos de treinar.
 *
 * O treino em andamento não tem mais aviso aqui: a barra acima da navegação
 * (`ActiveWorkoutBar`, prancha `Al-T1b`) já leva a ele em qualquer tela. E
 * começar outro com um aberto cai no aberto (`useStartSession`, 409).
 *
 * "Livre" e "Só cardio" levam ao Treino livre (Al-T17b, #381), que monta
 * antes de começar: o relógio só anda no "Iniciar treino".
 */

function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text
        accessibilityRole="header"
        className="font-display-semibold text-[17px] text-foreground"
      >
        {children}
      </Text>
      {action}
    </View>
  );
}

/**
 * A faixa da semana (prancha Al-T1), no desenho do `DayStrip` da Nutrição:
 * hoje em verde, os dias treinados (e o do treino aberto) contornados.
 */
function WeekRow({ week, activeSessionId }: { week: TrainingWeek; activeSessionId?: string }) {
  const router = useRouter();
  const chips = weekChips(week);
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <Text
          accessibilityRole="header"
          className="font-display-semibold text-[17px] text-foreground"
        >
          Semana
        </Text>
        <Text className="text-[13px] text-muted-foreground">{trainingWeekLabel(week)}</Text>
      </View>
      <View className="flex-row justify-between gap-1.5">
        {chips.map((chip) => {
          const target =
            chip.state === 'active' && activeSessionId
              ? `/workout/session/${activeSessionId}`
              : chip.state === 'trained'
                ? '/workout/history'
                : null;
          const outlined = !chip.today && chip.state !== 'rest';
          return (
            <Pressable
              key={chip.date}
              accessibilityRole={target ? 'button' : 'text'}
              accessibilityLabel={chip.label}
              disabled={!target}
              onPress={() => target && router.push(target as never)}
              className={cn(
                'h-16 flex-1 items-center justify-center gap-0.5 rounded-field',
                chip.today ? 'bg-primary' : 'bg-muted',
              )}
              style={
                outlined ? { borderWidth: 1.5, borderColor: `${colors.primaryText}80` } : undefined
              }
            >
              <Text
                className={cn(
                  'font-sans-semibold text-xs',
                  chip.today ? 'text-primary-foreground' : 'text-faint',
                )}
              >
                {chip.letter}
              </Text>
              <Text
                className={cn(
                  'font-display-semibold text-base',
                  chip.today ? 'text-primary-foreground' : 'text-foreground',
                )}
              >
                {chip.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MuscleShareBar({ plan }: { plan: WorkoutPlan }) {
  const bars = planMuscleBars(plan);
  if (bars.length === 0) return <View className="h-1.5 rounded-full bg-muted" />;
  return (
    <View className="h-1.5 flex-row gap-0.5 overflow-hidden rounded-full">
      {bars.map((b) => (
        <View
          key={b.group}
          style={{ flex: b.share, backgroundColor: colors[groupColorName(b.group)] }}
        />
      ))}
    </View>
  );
}

/** O cartão do plano (prancha Al-T1): nome e "SEU", resumo, prévia e a barra de músculos. */
function PlanCard({ plan, width }: { plan: WorkoutPlan; width: number }) {
  const router = useRouter();
  const info = planCardInfo(plan);
  const preview = planExercisePreview(plan);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${plan.name}, ${info}`}
      onPress={() => router.push(`/workout/plans/${plan.id}`)}
      style={{ width }}
      className="gap-2.5 rounded-card bg-card p-4 active:opacity-80"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} className="flex-1 font-sans-bold text-[17px] text-foreground">
          {plan.name}
        </Text>
        <View
          className="rounded-pill px-2.5 py-0.5"
          style={{ backgroundColor: `${colors.primary}29` }}
        >
          <Text className="font-sans-extrabold text-[11px] uppercase tracking-wide text-primary">
            Seu
          </Text>
        </View>
      </View>
      <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
        {info}
      </Text>
      {preview ? (
        <Text numberOfLines={1} className="text-sm text-foreground">
          {preview}
        </Text>
      ) : null}
      <View className="mt-auto">
        <MuscleShareBar plan={plan} />
      </View>
    </Pressable>
  );
}

function NewPlanCard({ width }: { width: number }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Novo plano"
      onPress={() => router.push('/workout/plans')}
      style={{ width, borderWidth: 1.5, borderColor: colors.borderStrong }}
      className="items-center justify-center gap-2 rounded-card p-4 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Plus size={16} color={colors.foreground} />
      </View>
      <Text className="font-sans-bold text-sm text-foreground">Novo plano</Text>
    </Pressable>
  );
}

/** Um jeito de começar (prancha Al-T1): ícone num quadrado de cor, nome e dica. */
function WayCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: typeof Plus;
  tone: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-[18px] bg-card p-3 active:opacity-80"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tone}29` }}
      >
        <Icon size={16} color={tone} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-sm text-foreground">{title}</Text>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * O bloco numa linha (prancha Al-T1: "Bloco hipertrofia · semana 2 de 4" e as
 * barras de volume). O toque abre o detalhe e o encerrar, ou o montar sem bloco.
 */
function BlockRow() {
  const [open, setOpen] = useState(false);
  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });
  if (block.isLoading) return null;
  const row = block.data ? blockRow(block.data) : null;
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={row ? `${row.title}, ${row.detail}` : 'Periodização em blocos'}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center gap-3 rounded-card bg-card px-4 py-3.5 active:opacity-80"
      >
        <View className="min-w-0 flex-1">
          <Text className="font-sans-bold text-sm text-foreground">
            {row ? row.title : 'Periodização em blocos'}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {row ? row.detail : 'de 3 a 6 semanas, com deload no fim'}
          </Text>
        </View>
        {row ? (
          <View className="h-7 flex-row items-end gap-1">
            {row.bars.map((b, i) => (
              <View
                key={i}
                className="w-2.5 rounded-[3px]"
                style={{
                  height: `${Math.max(0.3, b.ratio) * 100}%`,
                  backgroundColor: b.reached ? colors.primary : colors.surface3,
                }}
              />
            ))}
          </View>
        ) : null}
        <View style={open ? { transform: [{ rotate: '90deg' }] } : undefined}>
          <ChevronRight size={16} color={colors.faintForeground} />
        </View>
      </Pressable>
      {open ? <BlockTimeline /> : null}
    </View>
  );
}

function QuickCard({ template, width }: { template: QuickTemplate; width: number }) {
  const router = useRouter();
  const { tint, icon: Icon } = quickVisual(template.id);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${template.title}. ${template.level}, ${template.duration}, ${template.location}`}
      onPress={() => router.push(`/workout/quick/${template.id}`)}
      style={{ width, backgroundColor: tint }}
      className="h-36 justify-end overflow-hidden rounded-3xl p-4 active:opacity-80"
    >
      <View className="absolute right-3 top-3 opacity-30">
        <Icon size={56} color={colors.foreground} />
      </View>
      <Text className="text-[11px] font-sans-bold text-muted-foreground">{template.level}</Text>
      <Text className="mt-1 text-base font-sans-bold leading-tight text-foreground">
        {template.title}
      </Text>
      <Text className="mt-1 text-[12px] text-muted-foreground">
        {template.duration} · {template.location}
      </Text>
    </Pressable>
  );
}

export default function WorkoutScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // A mesma chave do carrossel: uma ida ao servidor para os dois.
  const summary = useQuery({
    queryKey: ['workout', 'muscles', 'week'],
    queryFn: () => workoutApi.getWeeklyMuscleSummary(),
  });

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  // Plano recebido da equipe esperando resposta (#379): o aviso no topo.
  const offers = useQuery({
    queryKey: ['plan-offers'],
    queryFn: () => planOffersApi.list(),
  });
  const pendingOffers = offers.data?.pending ?? [];

  const planWidth = Math.min(240, Math.round((width - 40) * 0.62));
  const quickCardWidth = Math.round((width - 40) * 0.7);

  return (
    <Screen
      refreshing={active.isRefetching || plans.isRefetching || summary.isRefetching}
      onRefresh={() => {
        void offers.refetch();
        void active.refetch();
        void plans.refetch();
        void summary.refetch();
      }}
    >
      <View className="gap-6 px-5 pb-4 pt-2">
        <TabHeader title="Treino">
          <HeaderButton label="Agenda" onPress={() => router.push('/workout/agenda' as Href)}>
            <CalendarDays size={20} color={colors.foreground} />
          </HeaderButton>
          <HeaderButton
            label="Histórico de treinos"
            onPress={() => router.push('/workout/history')}
          >
            <History size={20} color={colors.foreground} />
          </HeaderButton>
          <HeaderButton label="Novo plano" onPress={() => router.push('/workout/plans')}>
            <Plus size={22} color={colors.foreground} />
          </HeaderButton>
        </TabHeader>
        {pendingOffers.map((offer) => {
          const banner = receivedOfferBanner(offer);
          return (
            <Pressable
              key={offer.id}
              accessibilityRole="link"
              accessibilityLabel={`${banner.title}. ${banner.sub}`}
              onPress={() => router.push(offer.href as Href)}
              className="flex-row items-center gap-3 rounded-card bg-card px-3.5 py-3 active:opacity-80"
              style={{ borderWidth: 1, borderColor: `${colors.water}59` }}
            >
              <View
                className="h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: `${colors.water}2e` }}
              >
                <Text className="font-sans-extrabold text-[11px]" style={{ color: colors.water }}>
                  {initialsOf(offer.authorName)}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-sans-bold text-sm text-foreground">
                  {banner.title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                  {banner.sub}
                </Text>
              </View>
              <View
                className="h-[22px] justify-center rounded-pill px-[9px]"
                style={{ backgroundColor: `${colors.info}1a` }}
              >
                <Text className="font-sans-extrabold text-[11px] uppercase tracking-wide text-info">
                  {offer.kind === 'update' ? 'nova versão' : 'novo'}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {summary.data?.week ? (
          <WeekRow week={summary.data.week} activeSessionId={active.data?.id} />
        ) : null}

        <WorkoutCardsCarousel />

        <View className="gap-3">
          <SectionTitle
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver todos os planos"
                onPress={() => router.push('/workout/plans')}
                className="min-h-[44px] justify-center px-1"
              >
                <Text className="font-sans-bold text-[13px] text-primary-text">Ver todos</Text>
              </Pressable>
            }
          >
            Seus planos
          </SectionTitle>

          {plans.isLoading ? <LoadingState /> : null}
          {plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : null}

          {plans.data ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {/* Os circuitos têm o atalho deles em "Outros jeitos de treinar". */}
              {plans.data
                .filter((plan) => plan.kind !== 'CIRCUIT')
                .map((plan) => (
                  <PlanCard key={plan.id} plan={plan} width={planWidth} />
                ))}
              <NewPlanCard width={plans.data.length ? 140 : planWidth} />
            </ScrollView>
          ) : null}
        </View>

        <View className="gap-3">
          <SectionTitle>Outros jeitos de treinar</SectionTitle>
          {/* Modelos entra com a #379. */}
          <View className="flex-row gap-2">
            <WayCard
              title="Livre"
              subtitle="monte na hora"
              icon={Zap}
              tone={colors.primaryText}
              onPress={() => router.push('/workout/free' as Href)}
            />
            <WayCard
              title="Só cardio"
              subtitle="esteira, bike…"
              icon={Heart}
              tone={colors.danger}
              onPress={() => router.push('/workout/free?add=cardio' as Href)}
            />
          </View>
          <View className="flex-row gap-2">
            {/* Quem já tem circuito cai na lista deles (Al-T6); quem não tem, no Novo circuito. */}
            <WayCard
              title="Circuito"
              subtitle="AMRAP, EMOM"
              icon={Timer}
              tone={colors.warning}
              onPress={() =>
                router.push(
                  (plans.data?.some((p) => p.kind === 'CIRCUIT')
                    ? '/workout/plans?tab=circuitos'
                    : '/workout/circuits/new') as Href,
                )
              }
            />
            <View className="flex-1" />
          </View>
        </View>

        <BlockRow />

        {/* Os treinos rápidos não estão na prancha (os "Modelos" da #379 tomam o
            lugar deles): ficam no fim, depois do bloco, para não sumirem antes. */}
        <View className="gap-3">
          <SectionTitle>Treinos rápidos</SectionTitle>
          <Carousel
            data={QUICK_TEMPLATES}
            itemWidth={quickCardWidth}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => <QuickCard template={item} width={quickCardWidth} />}
          />
        </View>
      </View>
    </Screen>
  );
}

import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, History, ListChecks, Plus } from 'lucide-react-native';
import { QUICK_TEMPLATES, workoutApi, type QuickTemplate } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, Carousel, ErrorState, LoadingState } from '@/components/ui';
import { BlockTimeline } from '@/components/workout/block-timeline';
import { quickVisual } from '@/components/workout/quick-template-visual';
import { pluralize } from '@/components/workout/workout-stats';

/**
 * Réplica de `apps/web/src/app/(app)/workout/page.tsx`.
 *
 * Uma diferença de estrutura: no PWA esta página *vira* a sessão em andamento,
 * porque lá não existe rota para a sessão. No app nativo existe
 * (`/workout/session/[id]`), então aqui a sessão aberta aparece como um aviso no
 * topo que leva até ela. Assim o botão voltar do Android sai da sessão para o
 * seletor, em vez de sair do app.
 */

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-extrabold tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

function ActiveSessionBanner({ sessionId, startedAt }: { sessionId: string; startedAt: string }) {
  const router = useRouter();
  const time = new Date(startedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View>
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
          Treino em andamento
        </Text>
        <Text className="text-xs text-muted-foreground">Iniciado às {time}</Text>
      </View>
      <Button onPress={() => router.push(`/workout/session/${sessionId}`)}>Continuar treino</Button>
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
      className="h-44 justify-end overflow-hidden rounded-2xl border border-border p-4 active:opacity-80"
    >
      <View className="absolute right-3 top-3 opacity-30">
        <Icon size={64} color="#e5e2e1" />
      </View>
      <Text className="text-[10px] font-bold text-muted-foreground">{template.level}</Text>
      <Text className="mt-1 text-base font-extrabold leading-tight text-foreground">
        {template.title}
      </Text>
      <Text className="mt-1 text-[11px] text-muted-foreground">
        {template.duration} • {template.location}
      </Text>
    </Pressable>
  );
}

function ShortcutCard({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: typeof Plus;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 rounded-2xl border border-border bg-card p-4 active:opacity-80"
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-muted">
        <Icon size={16} color="#e5e2e1" />
      </View>
      <Text className="mt-3 text-sm font-bold leading-tight text-foreground">{label}</Text>
    </Pressable>
  );
}

export default function WorkoutScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();

  const active = useQuery({
    queryKey: ['workout', 'active'],
    queryFn: () => workoutApi.getActiveSession(),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const start = useMutation({
    mutationFn: () => workoutApi.startSession({ startedAt: new Date().toISOString() }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      router.push(`/workout/session/${session.id}`);
    },
  });

  const quickCardWidth = Math.round((width - 40) * 0.78);

  return (
    <Screen
      title="Treinos"
      refreshing={active.isRefetching || plans.isRefetching}
      onRefresh={() => {
        void active.refetch();
        void plans.refetch();
      }}
    >
      <View className="gap-5 px-5 pb-4 pt-4">
        <View className="flex-row items-center justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Histórico de treinos"
            onPress={() => router.push('/workout/history')}
            className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
          >
            <History size={18} color="#baccaf" />
          </Pressable>
        </View>

        {active.isLoading ? <LoadingState /> : null}
        {active.data ? (
          <ActiveSessionBanner sessionId={active.data.id} startedAt={active.data.startedAt} />
        ) : null}

        <View className="gap-2">
          <SectionLabel>PERIODIZAÇÃO</SectionLabel>
          <BlockTimeline />
        </View>

        <View className="gap-2">
          <SectionLabel>PERSONALIZAÇÃO</SectionLabel>
          <View className="flex-row gap-3">
            <ShortcutCard
              label="Criar um treino personalizado"
              icon={Plus}
              onPress={() => router.push('/workout/plans')}
            />
            <ShortcutCard
              label="Meus planos de treino"
              icon={ListChecks}
              onPress={() => router.push('/workout/plans')}
            />
          </View>
        </View>

        <View className="gap-2">
          <SectionLabel>TREINOS RÁPIDOS</SectionLabel>
          <Carousel
            data={QUICK_TEMPLATES}
            itemWidth={quickCardWidth}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => <QuickCard template={item} width={quickCardWidth} />}
          />
        </View>

        <Button
          className="h-14 rounded-2xl"
          textClassName="text-base font-extrabold tracking-wide"
          loading={start.isPending}
          onPress={() => start.mutate()}
        >
          INICIAR TREINO LIVRE
        </Button>

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <SectionLabel>MEUS PLANOS</SectionLabel>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver todos os planos"
              onPress={() => router.push('/workout/plans')}
              className="min-h-[44px] justify-center"
            >
              <Text className="text-[11px] font-extrabold text-primary">Ver tudo</Text>
            </Pressable>
          </View>

          {plans.isLoading ? <LoadingState /> : null}
          {plans.isError ? (
            <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
          ) : null}

          {plans.data && plans.data.length === 0 ? (
            <Text className="text-sm text-muted-foreground">
              Nenhum plano criado ainda.{' '}
              <Text
                accessibilityRole="link"
                onPress={() => router.push('/workout/plans')}
                className="font-bold text-primary underline"
              >
                Criar agora
              </Text>
            </Text>
          ) : null}

          {plans.data?.map((plan) => {
            const count = plan.exercises?.length ?? 0;
            const countLabel = `${count} ${pluralize(count, 'exercício', 'exercícios')}`;
            return (
              <Pressable
                key={plan.id}
                accessibilityRole="button"
                accessibilityLabel={`${plan.name}, ${countLabel}`}
                onPress={() => router.push(`/workout/plans/${plan.id}`)}
                className="min-h-[44px] flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
              >
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Dumbbell size={20} color="#2ce500" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-base font-bold text-foreground">
                    {plan.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{countLabel}</Text>
                </View>
                <ChevronRight size={16} color="#baccaf" />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

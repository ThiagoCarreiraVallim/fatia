import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react-native';
import { workoutApi, type TrainingBlock, type TrainingBlockWeek } from '@fatia/api-client';
import { Button, LoadingState } from '@/components/ui';

/** Réplica de `apps/web/src/components/workout/block-timeline.tsx` (#145). */

const FOCO_CURTO: Record<TrainingBlockWeek['focus'], string> = {
  accumulation: 'Acúmulo',
  peak: 'Pico',
  deload: 'Deload',
};

export function BlockTimeline() {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string | undefined>(undefined);

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
  });

  // Mesma `queryKey` da tela de treino: a lista já está em cache, e é ela que
  // permite periodizar um plano. Sem escolher plano aqui, todo bloco montado pela
  // tela nascia sem `planId` — e o `plannedToday` do dashboard nunca saía de nulo.
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
  });

  const criar = useMutation({
    mutationFn: () => workoutApi.createBlock({ planId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout', 'block'] }),
  });

  const encerrar = useMutation({
    mutationFn: (id: string) => workoutApi.deleteBlock(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout', 'block'] }),
  });

  if (block.isLoading) return <LoadingState />;

  const ativo = block.data;
  if (!ativo) {
    return (
      <View className="gap-3 rounded-2xl border border-border bg-card p-4">
        <Text className="text-sm font-bold text-foreground">Periodização em blocos</Text>
        <Text className="text-xs text-muted-foreground">
          Quatro semanas com carga e volume planejados, terminando em deload. Se você perder uma
          semana inteira, o bloco espera por você.
        </Text>
        {plans.data && plans.data.length > 0 ? (
          <View className="gap-2">
            <Text className="text-xs text-muted-foreground">Plano do bloco</Text>
            <View className="flex-row flex-wrap gap-2">
              {[{ id: undefined, name: 'Treino livre' }, ...plans.data].map((plan) => (
                <Pressable
                  key={plan.id ?? 'livre'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: planId === plan.id }}
                  onPress={() => setPlanId(plan.id)}
                  className={`min-h-[44px] justify-center rounded-xl px-3 ${
                    planId === plan.id ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      planId === plan.id ? 'text-primary-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {plan.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Button
          className="h-12 rounded-xl"
          loading={criar.isPending}
          onPress={() => criar.mutate()}
        >
          MONTAR BLOCO DE 4 SEMANAS
        </Button>
      </View>
    );
  }

  // Encerrar apaga o combinado das 4 semanas e não tem desfazer — o mesmo motivo
  // pelo qual a tool equivalente é `destructiveHint`.
  const confirmarEncerrar = () =>
    Alert.alert('Encerrar o bloco?', 'As 4 semanas planejadas somem e não dá para voltar atrás.', [
      { text: 'Manter', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: () => encerrar.mutate(ativo.id) },
    ]);

  return <BlockCard block={ativo} onEncerrar={confirmarEncerrar} />;
}

function BlockCard({ block, onEncerrar }: { block: TrainingBlock; onEncerrar: () => void }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <CalendarRange size={16} color="#2ce500" />
          </View>
          <View>
            <Text className="text-sm font-bold text-foreground">
              Bloco de {block.kindLabel} · {block.repRange} reps
            </Text>
            {block.planName ? (
              <Text className="text-xs text-muted-foreground">{block.planName}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Encerrar bloco de periodização"
          onPress={onEncerrar}
          className="min-h-[44px] justify-center"
        >
          <Text className="text-[11px] font-extrabold text-muted-foreground underline">
            Encerrar
          </Text>
        </Pressable>
      </View>

      <Text className="text-sm text-foreground">{block.explanation}</Text>

      <View className="flex-row gap-2">
        {block.weeks.map((week) => (
          <View
            key={week.weekNumber}
            className="flex-1 gap-1"
            accessibilityLabel={`Semana ${week.weekNumber}, ${FOCO_CURTO[week.focus]}, ${week.sessionsDone} de ${week.sessionsTarget} sessões`}
          >
            <View
              className={`h-1.5 rounded-full ${
                week.state === 'current' ? 'bg-primary' : barraDoEstado(week.state)
              }`}
            />
            <Text
              className={`text-[10px] font-bold ${
                week.state === 'current' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              S{week.weekNumber} · {FOCO_CURTO[week.focus]}
            </Text>
            <Text className="text-[10px] text-muted-foreground">
              {week.sessionsDone}/{week.sessionsTarget}
            </Text>
          </View>
        ))}
      </View>

      {block.nextWeek ? (
        <Text className="text-xs text-muted-foreground">Depois: {block.nextWeek.summary}</Text>
      ) : null}
    </View>
  );
}

function barraDoEstado(state: TrainingBlockWeek['state']): string {
  if (state === 'done') return 'bg-primary/60';
  if (state === 'partial') return 'bg-primary/30';
  if (state === 'missed') return 'bg-destructive/50';
  return 'bg-muted';
}

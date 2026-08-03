import { Pressable, Text, View } from 'react-native';
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

export function BlockTimeline({ planId }: { planId?: string }) {
  const qc = useQueryClient();

  const block = useQuery({
    queryKey: ['workout', 'block'],
    queryFn: () => workoutApi.getActiveBlock(),
    retry: false,
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

  return <BlockCard block={ativo} onEncerrar={() => encerrar.mutate(ativo.id)} />;
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

import { View } from 'react-native';
import {
  circuitComparisonLabel,
  circuitExercisePace,
  circuitExerciseTotal,
  circuitHeader,
  circuitResultFacts,
  circuitRoundRows,
  type CircuitSummary,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui';
import { ExerciseGroupLine } from '@/components/workout/plan-exercise-row';

/**
 * O circuito no "Treino feito" (Al-T5) com o desenho do Al-T11c. Réplica de
 * `apps/web/src/components/workout/circuit/circuit-result.tsx`; a #381
 * reaproveita no histórico.
 */
export function CircuitResultBlocks({ circuit }: { circuit: CircuitSummary }) {
  const facts = circuitResultFacts(circuit);
  const comparison = circuitComparisonLabel(circuit);
  const rows = circuitRoundRows(circuit);
  const longest = Math.max(1, ...rows.map((r) => r.seconds));
  const partial = rows.some((r) => r.partial);

  return (
    <>
      <View
        accessibilityLabel="Resultado do circuito"
        className="gap-2.5 rounded-3xl bg-steps p-[18px]"
      >
        <Text className="font-sans-bold text-xs uppercase tracking-[0.06em] text-background opacity-70">
          {circuit.completed ? 'Concluído' : 'Encerrado'} · {circuitHeader(circuit)}
        </Text>
        <View className="flex-row">
          {facts.map((f) => (
            <View
              key={f.label}
              accessible
              accessibilityLabel={`${f.label}: ${f.value}`}
              className="flex-1 gap-0.5"
            >
              <Text className="font-display-semibold text-[26px] text-background">{f.value}</Text>
              <Text className="font-sans-semibold text-xs text-background opacity-70">
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="flex-row gap-2">
        {comparison ? (
          <View className="flex-1 justify-center rounded-[18px] bg-card p-3.5">
            <Text
              className={cn(
                'font-sans-bold text-sm',
                comparison.tone === 'ok' ? 'text-primary-text' : 'text-muted-foreground',
              )}
            >
              {comparison.text}
            </Text>
          </View>
        ) : null}
        <View className="flex-1 gap-0.5 rounded-[18px] bg-card p-3.5">
          <Text className="font-sans-bold text-[22px] text-foreground">{circuit.totalReps}</Text>
          <Text className="text-xs text-faint">reps no total</Text>
        </View>
      </View>

      {rows.length > 0 ? (
        <View className="rounded-[20px] bg-card px-4 py-1">
          <Text className="pb-1 pt-2.5 text-xs text-faint">Tempo de cada round</Text>
          {rows.map((r, i) => (
            <View
              key={r.label}
              accessible
              accessibilityLabel={`${r.label}: ${r.value}`}
              className={cn(
                'min-h-10 flex-row items-center gap-2.5',
                i > 0 && 'border-t border-border',
              )}
            >
              <Text className="w-[56px] text-xs text-faint">{r.label}</Text>
              <View className="h-2 flex-1 rounded-full bg-surface-3">
                <View
                  className="h-full rounded-full bg-steps"
                  style={{ width: `${(r.seconds / longest) * 100}%` }}
                />
              </View>
              <Text className="w-12 text-right font-sans-bold text-sm text-foreground">
                {r.value}
              </Text>
            </View>
          ))}
          {partial ? (
            <Text className="pb-2.5 pt-2 text-xs text-faint">
              * round incompleto
              {circuit.stoppedAt ? `: o tempo acabou no ${circuit.stoppedAt.name}` : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="rounded-[20px] bg-card px-4 py-1">
        <Text className="pb-1 pt-2.5 text-xs text-faint">Exercícios</Text>
        {circuit.exercises.map((e, i) => (
          <View
            key={e.exerciseId}
            className={cn(
              'min-h-14 flex-row items-center gap-3',
              i > 0 && 'border-t border-border',
            )}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="font-sans-semibold text-sm text-foreground">
                {e.name}
              </Text>
              <ExerciseGroupLine
                group={e.muscleGroup}
                detail={circuitExercisePace(circuit.format, circuit.config, e)}
              />
            </View>
            <Text className="font-sans-bold text-sm text-foreground">
              {circuitExerciseTotal(e)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

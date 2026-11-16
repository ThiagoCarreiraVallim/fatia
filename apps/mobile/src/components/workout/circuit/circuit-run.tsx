import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Bell, BellOff, Check, Minus, Pause, Play, X } from 'lucide-react-native';
import {
  circuitDoneLine,
  circuitHeader,
  circuitIntervalsView,
  circuitLiveComparison,
  circuitRoundsView,
  circuitTotals,
  formatClock,
  type CircuitDefinition,
  type CircuitSessionData,
  type CircuitState,
  type WorkoutSession,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Text } from '@/components/ui/text';
import { ConfirmDrawer, cn } from '@/components/ui';
import { colors } from '@/theme/colors';
import { CircuitBadge } from './circuit-badge';
import { useCircuitRun } from './use-circuit-run';

/**
 * O relógio do circuito no app (#380): AMRAP (Al-T4), For Time (Al-T4c, fim
 * Al-T4e) e a tela de intervalos de Tabata (Al-T4b) e EMOM (Al-T4d). Réplica de
 * `apps/web/src/components/workout/circuit/circuit-run.tsx`, com a tela acesa,
 * háptico e os avisos do sistema com o app no fundo.
 */
export function CircuitRun({
  session,
}: {
  session: WorkoutSession & { circuit: CircuitSessionData };
}) {
  const router = useRouter();
  const run = useCircuitRun(session);
  const { def, state } = run;
  const done = state.status === 'done';
  const paused = state.status === 'paused';
  const [confirmEnd, setConfirmEnd] = useState(false);
  const intervals = def.format === 'EMOM' || def.format === 'TABATA';
  const view = intervals && !done ? circuitIntervalsView(def, state) : null;

  const footer = done ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: run.finish.isPending }}
      disabled={run.finish.isPending}
      onPress={() => run.finish.mutate()}
      className="h-14 flex-1 items-center justify-center rounded-pill bg-primary active:opacity-80"
    >
      <Text className="font-sans-bold text-[15px] text-primary-foreground">
        {run.finish.isPending ? 'Salvando...' : 'Salvar treino'}
      </Text>
    </Pressable>
  ) : (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Continuar' : 'Pausar'}
        onPress={() => run.push(paused ? 'resume' : 'pause')}
        className="h-14 w-14 items-center justify-center rounded-full bg-muted active:opacity-80"
      >
        {paused ? (
          <Play size={20} color={colors.foreground} />
        ) : (
          <Pause size={20} color={colors.foreground} />
        )}
      </Pressable>
      {intervals ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => run.push('skip')}
          className="h-14 flex-1 items-center justify-center rounded-pill bg-muted active:opacity-80"
        >
          <Text className="font-sans-bold text-[15px] text-foreground">
            {def.format === 'EMOM' ? 'Próximo minuto' : 'Pular fase'}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmEnd(true)}
        className={cn(
          'h-14 items-center justify-center rounded-pill bg-foreground active:opacity-80',
          intervals ? 'px-[18px]' : 'flex-1',
        )}
      >
        <Text className="font-sans-bold text-[15px] text-background">
          {intervals ? 'Encerrar' : 'Encerrar circuito'}
        </Text>
      </Pressable>
    </>
  );

  return (
    <>
      <Screen footer={footer}>
        {view ? (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 top-0 h-[520px]"
            style={{
              backgroundColor: `${view.tone === 'rest' ? colors.water : colors.primary}14`,
              borderBottomLeftRadius: 260,
              borderBottomRightRadius: 260,
            }}
          />
        ) : null}
        <View className="gap-4 px-4">
          <View className="flex-row items-center justify-between gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sair do circuito"
              onPress={() => router.push('/workout/plans?tab=circuitos' as Href)}
              className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-80"
            >
              <X size={20} color={colors.foreground} />
            </Pressable>
            <View accessibilityRole="header" className="min-w-0 flex-1 items-center">
              <CircuitBadge format={def.format} label={circuitHeader(def)} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={run.sound ? 'Desligar o som' : 'Ligar o som'}
              accessibilityState={{ selected: run.sound }}
              onPress={run.toggleSound}
              style={run.sound ? undefined : { opacity: 0.4 }}
              className="h-11 w-11 items-center justify-center rounded-full bg-card active:opacity-80"
            >
              {run.sound ? (
                <Bell size={20} color={colors.foreground} />
              ) : (
                <BellOff size={20} color={colors.foreground} />
              )}
            </Pressable>
          </View>

          {intervals ? (
            <IntervalsBody def={def} state={state} />
          ) : (
            <RoundsBody
              def={def}
              state={state}
              comparison={circuitLiveComparison(
                def.format,
                {
                  roundsCompleted: state.roundsCompleted,
                  partialExercises: state.exerciseIndex,
                  finalTimeSeconds: state.finalTimeSeconds,
                },
                run.previous,
              )}
              onMark={(count) => run.push('mark', count)}
              onRound={() => run.push('round')}
              onUnround={() => run.push('unround')}
              onSkipRest={() => run.push('skip')}
            />
          )}

          {run.saveFailed && !done ? (
            <Text accessibilityRole="alert" className="text-center text-xs text-warning">
              Sem conexão: o relógio segue aqui e grava quando a rede voltar.
            </Text>
          ) : null}
          {run.finish.isError ? (
            <Text accessibilityRole="alert" className="text-center text-sm text-danger">
              Não foi possível salvar o circuito.{' '}
              {run.finish.error instanceof Error ? run.finish.error.message : 'Tente de novo.'}
            </Text>
          ) : null}
        </View>
      </Screen>
      <ConfirmDrawer
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="Encerrar o circuito?"
        description="O que você fez até aqui fica salvo no histórico."
        confirmLabel="Encerrar"
        loading={run.finish.isPending}
        onConfirm={() => run.finish.mutate()}
      />
    </>
  );
}

function DoneMark() {
  return (
    <View className="h-[88px] w-[88px] items-center justify-center rounded-full bg-primary">
      <Check size={36} strokeWidth={3} color={colors.primaryForeground} />
    </View>
  );
}

function IntervalsBody({ def, state }: { def: CircuitDefinition; state: CircuitState }) {
  if (state.status === 'done') {
    const totals = circuitTotals(def, {
      roundsCompleted: 0,
      partialExercises: 0,
      intervalsCompleted: state.intervalsCompleted,
    });
    return (
      <View accessibilityLiveRegion="polite" className="items-center gap-3 pt-16">
        <DoneMark />
        <Text className="font-display text-[30px] text-foreground">
          {def.format === 'EMOM' ? 'EMOM concluído' : 'Tabata concluído'}
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {circuitDoneLine(def, { ...state, totals })}
        </Text>
      </View>
    );
  }
  const v = circuitIntervalsView(def, state);
  return (
    <View className="items-center gap-3.5 px-2 pt-6">
      <Text
        className={cn(
          'font-sans-extrabold text-sm tracking-[1.7px]',
          state.status === 'paused'
            ? 'text-muted-foreground'
            : v.tone === 'rest'
              ? 'text-water'
              : 'text-primary-text',
        )}
      >
        {v.phaseLabel}
      </Text>
      <Text
        accessibilityLabel={`${v.seconds} segundos`}
        className="font-display text-[150px] leading-[150px] text-foreground"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {v.seconds}
      </Text>
      <Text className="text-center font-display text-[28px] text-foreground">{v.now}</Text>
      <Text className="text-sm text-muted-foreground">a seguir · {v.next}</Text>
      <View className="mt-8 w-full flex-row gap-1.5">
        {v.dots.map((d, k) => (
          <View
            key={k}
            className={cn(
              'h-2 flex-1 rounded-full',
              d === 'done' && 'bg-primary',
              d === 'work' && 'bg-foreground',
              d === 'rest' && 'bg-water',
              d === 'todo' && 'bg-surface-3',
            )}
          />
        ))}
      </View>
      <Text className="text-center text-xs text-faint">{v.foot}</Text>
    </View>
  );
}

function RoundsBody({
  def,
  state,
  comparison,
  onMark,
  onRound,
  onUnround,
  onSkipRest,
}: {
  def: CircuitDefinition;
  state: CircuitState;
  comparison: { text: string; tone: 'ok' | 'neutral' } | null;
  onMark: (count: number) => void;
  onRound: () => void;
  onUnround: () => void;
  onSkipRest: () => void;
}) {
  const forTime = def.format === 'FOR_TIME';
  const rounds = def.config.rounds ?? 1;

  if (state.status === 'done') {
    const final = forTime && state.finalTimeSeconds !== null;
    return (
      <View accessibilityLiveRegion="polite" className="items-center gap-2.5 pt-8">
        <DoneMark />
        <Text className="text-sm text-muted-foreground">
          {final ? 'tempo final' : 'rounds + exercícios'}
        </Text>
        <Text className="font-display text-[64px] leading-[68px] text-foreground">
          {final
            ? formatClock(state.finalTimeSeconds!)
            : `${state.roundsCompleted} + ${state.exerciseIndex}`}
        </Text>
        <Text className="text-center text-sm text-muted-foreground">
          {circuitDoneLine(def, { ...state, totals: [] })}
        </Text>
        {comparison ? (
          <View
            className="h-[22px] justify-center rounded-pill px-[9px]"
            style={{
              backgroundColor: comparison.tone === 'ok' ? `${colors.success}1f` : colors.surface3,
            }}
          >
            <Text
              className={cn(
                'font-sans-extrabold text-[11px] uppercase tracking-wide',
                comparison.tone === 'ok' ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {comparison.text}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  const v = circuitRoundsView(def, state);
  const total = state.totalSeconds ?? 0;
  const ringOffset = total > 0 ? 100 - (state.clockSeconds / total) * 100 : 0;
  const r = 16;
  const length = 2 * Math.PI * r;

  return (
    <>
      {forTime ? (
        <>
          <View className="flex-row items-center gap-4 rounded-3xl bg-card p-4">
            <View className="min-w-0 flex-1">
              <Text className="text-xs text-faint">tempo</Text>
              <Text className="font-display text-[52px] leading-[56px] text-foreground">
                {formatClock(state.clockSeconds)}
              </Text>
              <Text className="text-xs text-faint">o cronômetro sobe até você terminar</Text>
            </View>
            <View className="items-center gap-1.5">
              <Text className="text-xs text-faint">round</Text>
              <Text className="font-display text-[44px] leading-[48px] text-foreground">
                {Math.min(rounds, state.roundsCompleted + 1)}
                <Text className="text-xl text-faint"> de {rounds}</Text>
              </Text>
            </View>
          </View>
          <View className="flex-row gap-1.5">
            {Array.from({ length: rounds }, (_, k) => (
              <View
                key={k}
                className={cn(
                  'h-2 flex-1 rounded-full',
                  k < state.roundsCompleted
                    ? 'bg-primary'
                    : k === state.roundsCompleted
                      ? 'bg-foreground'
                      : 'bg-surface-3',
                )}
              />
            ))}
          </View>
        </>
      ) : (
        <View className="flex-row items-center gap-4 rounded-3xl bg-card p-4">
          <View className="h-[132px] w-[132px]">
            <Svg
              width={132}
              height={132}
              viewBox="0 0 36 36"
              style={{ transform: [{ rotate: '-90deg' }] }}
            >
              <Circle
                cx={18}
                cy={18}
                r={r}
                fill="none"
                strokeWidth={2.4}
                stroke={colors.surface3}
              />
              <Circle
                cx={18}
                cy={18}
                r={r}
                fill="none"
                strokeWidth={2.4}
                strokeLinecap="round"
                stroke={colors.primary}
                strokeDasharray={`${length} ${length}`}
                strokeDashoffset={(ringOffset / 100) * length}
              />
            </Svg>
            <View className="absolute inset-0 items-center justify-center">
              <Text className="font-display text-[30px] leading-[34px] text-foreground">
                {formatClock(state.clockSeconds)}
              </Text>
              <Text className="text-xs text-faint">
                {state.status === 'paused' ? 'pausado' : 'restam'}
              </Text>
            </View>
          </View>
          <View className="flex-1 items-center gap-2">
            <Text className="text-xs text-faint">rounds completos</Text>
            <Text
              accessibilityLiveRegion="polite"
              className="font-display text-[56px] leading-[60px] text-foreground"
            >
              {state.roundsCompleted}
            </Text>
            <View className="flex-row gap-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tirar um round"
                disabled={state.roundsCompleted === 0}
                onPress={onUnround}
                style={state.roundsCompleted === 0 ? { opacity: 0.4 } : undefined}
                className="h-10 w-10 items-center justify-center rounded-full bg-surface-3 active:opacity-80"
              >
                <Minus size={14} color={colors.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onRound}
                className="h-10 justify-center rounded-full bg-primary px-4 active:opacity-80"
              >
                <Text className="font-sans-bold text-sm text-primary-foreground">+1 round</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {v.resting ? (
        <View className="items-center gap-1 py-1">
          <Text className="font-sans-extrabold text-[11px] uppercase tracking-[1.3px] text-water">
            descanso
          </Text>
          <Text className="font-display text-[28px] text-foreground">
            {formatClock(v.resting.seconds)}
          </Text>
          <Text className="text-xs text-faint">a seguir · {v.resting.next}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSkipRest}
            className="mt-1 h-10 justify-center rounded-full bg-muted px-4 active:opacity-80"
          >
            <Text className="font-sans-bold text-sm text-foreground">Pular descanso</Text>
          </Pressable>
        </View>
      ) : (
        <View className="items-center gap-0.5 py-1">
          <Text className="font-sans-extrabold text-[11px] uppercase tracking-[1.3px] text-faint">
            agora
          </Text>
          <Text className="text-center font-display text-[28px] text-foreground">{v.now}</Text>
          <Text className="text-xs text-faint">toque no exercício quando terminar</Text>
        </View>
      )}

      <View className="overflow-hidden rounded-[20px] bg-card">
        {v.items.map((item, i) => {
          const current = item.status === 'current';
          const isDone = item.status === 'done';
          return (
            <Pressable
              key={`${item.name}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={isDone ? `${item.name}, feito` : `Terminei ${item.name}`}
              accessibilityState={{ disabled: isDone || v.resting !== null }}
              disabled={isDone || v.resting !== null}
              // Tocar num exercício adiante marca também os anteriores do round.
              onPress={() => onMark(i - state.exerciseIndex + 1)}
              style={[
                current ? { backgroundColor: `${colors.primary}1f` } : undefined,
                isDone ? { opacity: 0.5 } : undefined,
              ]}
              className={cn(
                'min-h-[60px] flex-row items-center gap-3 px-4 active:opacity-80',
                i > 0 && !current && 'border-t border-border',
              )}
            >
              <View
                className={cn(
                  'h-[26px] w-[26px] items-center justify-center rounded-full',
                  isDone ? 'bg-primary' : 'border-2 border-border-strong',
                )}
              >
                {isDone ? (
                  <Check size={14} strokeWidth={3} color={colors.primaryForeground} />
                ) : null}
              </View>
              <Text className="flex-1 font-sans-semibold text-[15px] text-foreground">
                {item.name}
              </Text>
              <Text className="font-sans-bold text-sm text-foreground">{item.value}</Text>
            </Pressable>
          );
        })}
      </View>
      {!forTime ? (
        <Text className="px-1 text-xs text-faint">
          Ao marcar o último, o round conta sozinho. Se perder a conta, use +1 round.
        </Text>
      ) : null}
    </>
  );
}

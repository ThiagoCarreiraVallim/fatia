import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import {
  buildExerciseGroups,
  orderExerciseGroups,
  pickFocusedGroup,
  type MuscleGroup,
  type WorkoutSession,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { Button, ConfirmDrawer, DrawerLayer, Switch, cn, useConfirm } from '@/components/ui';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { ExerciseVisual, useExerciseDetail } from '@/components/workout/exercise-media';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { groupColorName } from '@/components/workout/workout-home';
import { ActiveCardioCard } from './active-cardio-card';
import { ActiveExerciseCard } from './active-exercise-card';
import { isExerciseComplete, pluralize, targetSetsOf } from './format';
import { guidedState, nextOpenIndex } from './guided-session';
import { isResting, RestPanel } from './rest-panel';
import { SessionHeader } from './session-header';
import { useAutoAdvance } from './use-auto-advance';
import { useSessionExitGuard } from './use-exit-guard';
import { useFinishSession } from './use-finish-session';
import { useFocusRequest, usePendingExercises } from './use-pending-exercises';
import { useSessionRestTimer } from './rest-timer-provider';
import { colors } from '@/theme/colors';

/**
 * A sessão guiada (pranchas `Al-T3-Sessao` e `Al-T3d-Sessao-sem-video`, #377).
 *
 * Um exercício por tela, com "exercício X de N" e setas para os vizinhos. Três
 * estados, decididos em `guidedState`:
 *
 * - trabalhando: carga e reps, "Como foi a série?" e "Concluir série N";
 * - descansando: o anel do descanso global (`RestTimerProvider`);
 * - escolhendo: o exercício acabou — a lista do que falta, "Adicionar
 *   exercício" e "Finalizar treino". Com "Passar sozinho" ligado, a tela pula
 *   direto para o próximo aberto quando o descanso termina.
 *
 * Reordenar e tirar exercícios saíram daqui para o "Treino atual" (`Al-T17`,
 * rota `edit`), que é onde o canvas os põe.
 *
 * Os drawers são irmãos do conteúdo, dentro de `<DrawerLayer>`: o bottom sheet
 * nativo não é portal (ver `ui/drawer.tsx`).
 */
export function ActiveSession({
  session,
  refreshing,
  onRefresh,
  initialSearch,
}: {
  session: WorkoutSession;
  refreshing: boolean;
  onRefresh: () => void;
  /** "Só cardio" abre a sessão já com a busca filtrada. */
  initialSearch?: MuscleGroup;
}) {
  // A tela apagando no meio da série obrigaria a desbloquear com a mão que
  // segura a barra.
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const exit = useSessionExitGuard();
  const rest = useSessionRestTimer();
  const confirm = useConfirm();
  const finish = useFinishSession(session.id);
  const { pending, add } = usePendingExercises(session.id);
  const { focus: requestedFocus, request: requestFocus } = useFocusRequest(session.id);
  const [autoAdvance, setAutoAdvance] = useAutoAdvance();
  const scrollRef = useRef<ScrollView>(null);

  const [searchOpen, setSearchOpen] = useState(initialSearch != null);
  const [searchGroup, setSearchGroup] = useState<MuscleGroup | undefined>(initialSearch);
  const [currentId, setCurrentId] = useState<number | null>(null);
  // A série que fechou o exercício: quando o descanso acabar, passa sozinho.
  const [advanceFrom, setAdvanceFrom] = useState<number | null>(null);

  const groups = useMemo(
    () =>
      orderExerciseGroups(
        buildExerciseGroups(session.plannedExercises, session.sets, pending),
        session.exerciseOrder,
      ),
    [session.plannedExercises, session.sets, session.exerciseOrder, pending],
  );

  const index = (() => {
    const picked = groups.findIndex((g) => g.exerciseId === currentId);
    if (picked >= 0) return picked;
    const focused = pickFocusedGroup(groups, new Set(), null);
    const i = focused ? groups.findIndex((g) => g.exerciseId === focused.exerciseId) : -1;
    return i >= 0 ? i : groups.length - 1;
  })();
  const current = index >= 0 ? groups[index] : undefined;
  const resting = isResting(rest);
  const state = guidedState({
    resting,
    complete: current ? isExerciseComplete(current) : true,
  });
  const nextIndex = index >= 0 ? nextOpenIndex(groups, index) : null;
  const next = nextIndex != null ? groups[nextIndex] : undefined;
  const detail = useExerciseDetail(current?.exerciseId ?? 0);

  function goTo(i: number) {
    const target = groups[i];
    if (!target) return;
    setAdvanceFrom(null);
    setCurrentId(target.exerciseId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  // O "Treino atual" pediu um exercício (Continuar / Retomar / Iniciar). O
  // ajuste é durante o render (#187); o efeito só limpa o pedido no cache,
  // que é sistema externo a esta tela.
  const [seenFocus, setSeenFocus] = useState<number | null>(null);
  if (requestedFocus != null && requestedFocus !== seenFocus) {
    setSeenFocus(requestedFocus);
    setAdvanceFrom(null);
    setCurrentId(requestedFocus);
  } else if (requestedFocus == null && seenFocus != null) {
    setSeenFocus(null);
  }
  useEffect(() => {
    if (requestedFocus != null) requestFocus(null);
  }, [requestedFocus, requestFocus]);

  // Passar sozinho: o descanso da série que fechou o exercício acabou.
  if (advanceFrom != null && !resting) {
    setAdvanceFrom(null);
    if (autoAdvance) {
      const from = groups.findIndex((g) => g.exerciseId === advanceFrom);
      const to = from >= 0 ? nextOpenIndex(groups, from) : null;
      if (to != null) setCurrentId(groups[to]!.exerciseId);
    }
  }

  function requestFinish() {
    const done = groups.reduce((acc, g) => acc + g.sets.length, 0);
    confirm({
      title: 'Finalizar treino?',
      description:
        done === 0
          ? 'Nenhuma série registrada ainda.'
          : `${done} ${pluralize(done, 'série registrada', 'séries registradas')}.`,
      confirmLabel: 'Finalizar',
      cancelLabel: 'Continuar treinando',
      onConfirm: () => finish.mutate(),
    });
  }

  const nextLabel = (() => {
    if (current && !isExerciseComplete(current)) {
      return `${current.exerciseName} · série ${current.sets.length + 1}`;
    }
    return next ? next.exerciseName : null;
  })();

  const groupName = detail.data?.muscleGroup;
  const remaining = groups.filter((g, i) => i !== index && !isExerciseComplete(g));

  return (
    <>
      <ExerciseDetailHost>
        <View className="flex-1 bg-background">
          <SessionHeader
            startedAt={session.startedAt}
            onMinimize={exit.leave}
            onOverview={() => router.push(`/workout/session/${session.id}/edit`)}
            onFinish={requestFinish}
          />
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primaryText}
                colors={[colors.primaryText]}
              />
            }
          >
            {current ? (
              <>
                <View className="gap-1">
                  <View className="flex-row items-center">
                    <NavArrow
                      label="Exercício anterior"
                      disabled={index <= 0}
                      onPress={() => goTo(index - 1)}
                    >
                      <ChevronLeft size={20} color={colors.foreground} />
                    </NavArrow>
                    <Text className="flex-1 text-center text-[13px] text-muted-foreground">
                      exercício {index + 1} de {groups.length}
                    </Text>
                    <NavArrow
                      label="Próximo exercício"
                      disabled={index >= groups.length - 1}
                      onPress={() => goTo(index + 1)}
                    >
                      <ChevronRight size={20} color={colors.foreground} />
                    </NavArrow>
                  </View>
                  <Text
                    accessibilityRole="header"
                    className="text-center font-display text-[28px] leading-[32px] text-foreground"
                  >
                    {current.exerciseName}
                  </Text>
                  {groupName ? (
                    <View className="flex-row items-center justify-center gap-1.5">
                      <View
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: colors[groupColorName(groupName)] }}
                      />
                      <Text className="text-[12px] capitalize text-muted-foreground">
                        {groupName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <ExerciseVisual
                  key={`visual-${current.exerciseId}`}
                  exerciseId={current.exerciseId}
                  exerciseName={current.exerciseName}
                />

                {current.isCardio ? (
                  <ActiveCardioCard
                    key={current.exerciseId}
                    sessionId={session.id}
                    group={current}
                    working={state === 'working'}
                    onLogged={(completed) => {
                      if (completed) setAdvanceFrom(current.exerciseId);
                    }}
                  />
                ) : (
                  // `key` por exercício: sem ela a carga digitada no anterior
                  // continuaria no campo do próximo.
                  <ActiveExerciseCard
                    key={current.exerciseId}
                    sessionId={session.id}
                    sessionStartedAt={session.startedAt}
                    group={current}
                    rest={rest}
                    working={state === 'working'}
                    onLogged={(completed) => {
                      if (completed) setAdvanceFrom(current.exerciseId);
                    }}
                  />
                )}
              </>
            ) : (
              <View className="gap-1 rounded-3xl bg-card p-4">
                <Text className="font-sans-bold text-base text-foreground">Treino livre</Text>
                <Text className="text-[13px] text-muted-foreground">
                  Adicione o primeiro exercício para começar.
                </Text>
              </View>
            )}

            {state === 'resting' ? <RestPanel timer={rest} next={nextLabel} /> : null}

            {state === 'picking' ? (
              <View className="gap-3">
                {current ? (
                  <Text className="font-sans-bold text-base text-foreground">
                    {remaining.length > 0 ? 'E agora?' : 'Tudo feito por aqui.'}
                  </Text>
                ) : null}
                {remaining.map((g) => {
                  const i = groups.indexOf(g);
                  const target = targetSetsOf(g);
                  const badge =
                    g.sets.length === 0
                      ? g.isCardio
                        ? 'cardio'
                        : `${target} ${pluralize(target, 'série', 'séries')}`
                      : `${g.sets.length} de ${target}`;
                  return (
                    <Pressable
                      key={g.exerciseId}
                      accessibilityRole="button"
                      accessibilityLabel={`Fazer ${g.exerciseName}, ${badge}`}
                      onPress={() => goTo(i)}
                      className={cn(
                        'min-h-[56px] flex-row items-center gap-3 rounded-2xl px-4 active:opacity-80',
                        i === nextIndex ? 'bg-primary/15' : 'bg-card',
                      )}
                    >
                      <Text
                        numberOfLines={1}
                        className="flex-1 font-sans-bold text-sm text-foreground"
                      >
                        {g.exerciseName}
                      </Text>
                      <View className="rounded-full bg-muted px-2.5 py-1">
                        <Text className="text-[11px] font-sans-bold text-muted-foreground">
                          {badge}
                        </Text>
                      </View>
                      {i === nextIndex ? (
                        <Text className="text-[11px] font-sans-bold text-primary-text">
                          próximo
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
                <Button
                  variant="outline"
                  className="h-12 rounded-full"
                  onPress={() => {
                    setSearchGroup(undefined);
                    setSearchOpen(true);
                  }}
                >
                  <Plus size={16} color={colors.foreground} />
                  <Text className="font-sans-bold text-sm text-foreground">
                    Adicionar exercício
                  </Text>
                </Button>
                <Button
                  className="h-14 rounded-full"
                  loading={finish.isPending}
                  disabled={finish.isPending}
                  onPress={requestFinish}
                >
                  Finalizar treino
                </Button>
              </View>
            ) : null}

            <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <View className="flex-1">
                <Text className="text-sm text-foreground">
                  Passar sozinho para o próximo exercício
                </Text>
                <Text className="text-[12px] text-muted-foreground">
                  {autoAdvance
                    ? 'Quando o descanso da última série acaba'
                    : 'Você escolhe o próximo na lista'}
                </Text>
              </View>
              <Switch
                checked={autoAdvance}
                onCheckedChange={setAutoAdvance}
                label="Passar sozinho para o próximo exercício"
              />
            </View>
          </ScrollView>
        </View>
      </ExerciseDetailHost>

      <DrawerLayer>
        <ExerciseSearchDrawer
          open={searchOpen}
          onOpenChange={setSearchOpen}
          muscleGroup={searchGroup}
          onPick={(exercise) => {
            add(exercise);
            setCurrentId(exercise.id);
          }}
        />
        <ConfirmDrawer
          open={exit.exitOpen}
          onOpenChange={exit.setExitOpen}
          title="Sair do treino?"
          description="O treino continua em andamento. A barra de baixo leva de volta a ele."
          confirmLabel="Sair por enquanto"
          cancelLabel="Continuar treinando"
          onConfirm={exit.leave}
        />
      </DrawerLayer>
    </>
  );
}

function NavArrow({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={disabled ? { opacity: 0.3 } : undefined}
      className="h-11 w-11 items-center justify-center rounded-full bg-muted active:opacity-80"
    >
      {children}
    </Pressable>
  );
}

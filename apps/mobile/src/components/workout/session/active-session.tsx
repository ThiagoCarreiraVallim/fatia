import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import {
  buildExerciseGroups,
  exerciseDetailPath,
  exerciseVideoSource,
  muscleGroupLabel,
  orderExerciseGroups,
  pickFocusedGroup,
  type ExerciseGroup,
  type MuscleGroup,
  type StrengthMuscleGroup,
  type WorkoutSession,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { Button, ConfirmDrawer, DrawerLayer, cn, useConfirm } from '@/components/ui';
import { ExerciseDetailContext } from '@/components/workout/exercise-detail-context';
import { ExerciseHeading, useExerciseDetail } from '@/components/workout/exercise-media';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { groupColorName } from '@/components/workout/workout-home';
import { ActiveCardioCard } from './active-cardio-card';
import { ActiveExerciseCard } from './active-exercise-card';
import { isExerciseComplete, pluralize, targetSetsOf } from './format';
import { guidedState, isSessionDone, nextOpenIndex } from './guided-session';
import { isResting, RestPanel } from './rest-panel';
import { SESSION_HEADER_HEIGHT, SessionHeader } from './session-header';
import {
  SessionDockHost,
  SessionDockProvider,
  useDockedAction,
  useSessionDockStore,
} from './session-dock';
import { SessionExerciseCard, useSessionExerciseActions } from './session-exercise-card';
import { dockLayout } from './session-dock-store';
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
  // O "Concluir série" preso embaixo, fora da rolagem (`session-dock.tsx`).
  const dock = useSessionDockStore();
  const [dockHeight, setDockHeight] = useState(0);
  const dockPlace = dockLayout({ safeBottom: insets.bottom, dockHeight });

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
  // Tudo feito (e fora do descanso): no lugar do "Tudo feito por aqui" vazio,
  // o treino até aqui, com as séries de cada exercício (prancha Al-T17).
  const showDone = state !== 'resting' && isSessionDone(groups);
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
  const openOverview = () => router.push(`/workout/session/${session.id}/edit`);

  // "Como fazer" é outra tela (Al-T9). A sessão guiada pode ser remontada na
  // volta; o pedido de foco (mesmo cache do "Treino atual") a faz reabrir no
  // exercício em que a pessoa estava.
  const openHowTo = useCallback(
    (exerciseId: number) => {
      requestFocus(exerciseId);
      router.push(exerciseDetailPath(exerciseId));
    },
    [requestFocus, router],
  );

  // Prancha Al-T3: com vídeo, ele é o fundo do topo e o cabeçalho flutua por cima.
  const videoTop = !showDone && current != null && exerciseVideoSource(detail.data) != null;

  // "1/7" e as setas, na linha da série (prancha `Al-T3d`).
  const exerciseNav = (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-[12px] text-faint" style={{ fontVariant: ['tabular-nums'] }}>
        {index + 1}/{groups.length}
      </Text>
      <NavArrow label="Exercício anterior" disabled={index <= 0} onPress={() => goTo(index - 1)}>
        <ChevronLeft size={16} color={colors.foreground} />
      </NavArrow>
      <NavArrow
        label="Próximo exercício"
        disabled={index >= groups.length - 1}
        onPress={() => goTo(index + 1)}
      >
        <ChevronRight size={16} color={colors.foreground} />
      </NavArrow>
    </View>
  );

  // O "Passar sozinho" é um check, como na prancha; o rótulo explica o efeito.
  const autoToggle = (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: autoAdvance }}
      accessibilityLabel="Passar sozinho para o próximo exercício"
      onPress={() => setAutoAdvance(!autoAdvance)}
      className="min-h-[48px] flex-row items-center gap-3 px-1"
    >
      <View
        className={cn(
          'h-6 w-6 items-center justify-center rounded-md',
          autoAdvance ? 'bg-primary' : 'border-[1.5px] border-border-strong',
        )}
      >
        {autoAdvance ? <Check size={16} color={colors.primaryForeground} /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-[13px] text-foreground">Passar sozinho para o próximo exercício</Text>
        <Text className="text-[12px] text-muted-foreground">
          {autoAdvance
            ? 'ao terminar as séries, já abre o seguinte'
            : 'ao terminar, você escolhe qual fazer'}
        </Text>
      </View>
    </Pressable>
  );
  const remaining = groups.filter((g, i) => i !== index && !isExerciseComplete(g));

  return (
    <>
      <ExerciseDetailContext.Provider value={openHowTo}>
        <SessionDockProvider value={dock}>
          <View className="flex-1 bg-background">
            <SessionHeader
              startedAt={session.startedAt}
              onMinimize={exit.leave}
              onFinish={requestFinish}
              overVideo={videoTop}
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              ref={scrollRef}
              className="flex-1"
              contentContainerStyle={{
                padding: 20,
                paddingBottom: dockPlace.scrollPaddingBottom,
                gap: 16,
              }}
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
              {showDone ? (
                <DoneSummary
                  session={session}
                  groups={groups}
                  onOpen={openOverview}
                  onAddExercise={() => {
                    setSearchGroup(undefined);
                    setSearchOpen(true);
                  }}
                  onFinish={requestFinish}
                  finishing={finish.isPending}
                />
              ) : current ? (
                <>
                  <ExerciseHeading
                    key={`heading-${current.exerciseId}`}
                    exerciseId={current.exerciseId}
                    exerciseName={current.exerciseName}
                    groupColor={
                      groupName ? colors[groupColorName(groupName)] : colors.faintForeground
                    }
                    groupLabel={
                      groupName
                        ? groupName === 'cardio'
                          ? 'Cardio'
                          : muscleGroupLabel(groupName as StrengthMuscleGroup)
                        : null
                    }
                    bleed={{
                      top: 20,
                      side: 20,
                      header: insets.top + SESSION_HEADER_HEIGHT,
                    }}
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
                      nav={exerciseNav}
                      onAll={openOverview}
                      beforeSubmit={autoToggle}
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
                      nav={exerciseNav}
                      onAll={openOverview}
                      beforeSubmit={autoToggle}
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

              {state === 'picking' && !showDone ? (
                <View className="gap-3">
                  {current ? (
                    <Text className="font-sans-bold text-base text-foreground">E agora?</Text>
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

              {(state === 'working' && current) || showDone ? null : autoToggle}
            </ScrollView>
            <SessionDockHost store={dock} bottom={dockPlace.bottom} onHeight={setDockHeight} />
          </View>
        </SessionDockProvider>
      </ExerciseDetailContext.Provider>

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
      className="h-9 w-9 items-center justify-center rounded-full bg-muted active:opacity-80"
    >
      {children}
    </Pressable>
  );
}

/**
 * Tudo feito: o treino até aqui, cada exercício com as séries (o cartão do
 * Treino atual, prancha Al-T17), para conferir e corrigir antes de finalizar.
 * "+ Exercício" e "Finalizar treino" ficam presos embaixo, como o "Concluir
 * série".
 */
function DoneSummary({
  session,
  groups,
  onOpen,
  onAddExercise,
  onFinish,
  finishing,
}: {
  session: WorkoutSession;
  groups: ExerciseGroup[];
  onOpen: () => void;
  onAddExercise: () => void;
  onFinish: () => void;
  finishing: boolean;
}) {
  const [editing, setEditing] = useState<{ exerciseId: number; index: number } | null>(null);
  // Tudo completo: "+ Série" sempre tem a última para copiar.
  const actions = useSessionExerciseActions(session, { onStartEmpty: onOpen });
  const sets = groups.reduce((acc, g) => acc + g.sets.length, 0);
  const footer = useDockedAction(
    <View className="flex-row gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar exercício"
        onPress={onAddExercise}
        className="h-14 flex-row items-center justify-center gap-1.5 rounded-full bg-muted px-5 active:opacity-80"
      >
        <Plus size={16} color={colors.foreground} />
        <Text className="font-sans-bold text-[15px] text-foreground">Exercício</Text>
      </Pressable>
      <Button
        className="h-14 flex-1 rounded-full"
        loading={finishing}
        disabled={finishing}
        onPress={onFinish}
      >
        Finalizar treino
      </Button>
    </View>,
  );

  return (
    <View className="gap-3">
      <View>
        <Text
          accessibilityRole="header"
          className="font-display-semibold text-[22px] text-foreground"
        >
          Treino de hoje
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {groups.length} {pluralize(groups.length, 'exercício', 'exercícios')} · {sets}{' '}
          {pluralize(sets, 'série', 'séries')}
        </Text>
      </View>
      {groups.map((group, position) => (
        <SessionExerciseCard
          key={group.exerciseId}
          session={session}
          group={group}
          position={position}
          count={groups.length}
          editing={editing?.exerciseId === group.exerciseId ? editing.index : null}
          onEdit={(i) => setEditing(i == null ? null : { exerciseId: group.exerciseId, index: i })}
          onAction={onOpen}
          onAddSet={() => actions.addSetTo(group)}
          addDisabled={actions.addPending}
          onRemove={() => actions.requestRemove(group)}
          removeDisabled={actions.removePending}
        />
      ))}
      {footer}
    </View>
  );
}

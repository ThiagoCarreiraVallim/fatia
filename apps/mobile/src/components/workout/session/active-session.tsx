import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { ChevronDown, ChevronUp, Play, Plus, Trash2 } from 'lucide-react-native';
import {
  buildExerciseGroups,
  moveExerciseInOrder,
  orderExerciseGroups,
  pickFocusedGroup,
  type ExerciseGroup,
  type PendingExercise,
  type SessionSet,
  type WorkoutSession,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, ConfirmDrawer, DrawerLayer } from '@/components/ui';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { ExerciseSearchDrawer } from '@/components/workout/exercise-search-drawer';
import { ActiveCardioCard } from './active-cardio-card';
import { ActiveExerciseCard } from './active-exercise-card';
import { FinishSessionDrawer } from './finish-session-drawer';
import { groupCardItem } from './exercise-card-item';
import { RpeDrawer } from './rpe-drawer';
import { SessionHeader } from './session-header';
import { SetRow } from './set-row';
import { sessionProgress } from './format';
import { useCancelSession } from './use-cancel-session';
import { useSessionExitGuard } from './use-exit-guard';
import { useSessionLayout } from './use-session-layout';
import { useRestTimer } from './use-rest-timer';
import { cores } from '@/theme/cores';

/**
 * Sessão em andamento — o `ActiveSession` de `apps/web/src/app/(app)/workout/page.tsx`,
 * que no PWA vive dentro da tela de treinos porque lá não existe rota de sessão.
 *
 * Um exercício por vez fica em foco (o primeiro incompleto que não foi pulado) e
 * os demais aparecem abaixo em modo leitura, editáveis série a série. É o mesmo
 * recorte do PWA: no meio do treino, decidir onde tocar já é esforço demais.
 *
 * O foco segue a ordem, mas a academia não: o aparelho do próximo exercício
 * está ocupado e a pessoa pula para outro. Cada card abaixo tem "Fazer agora",
 * que o traz para o foco, e setas e lixeira para arrumar a ordem ou tirar o
 * exercício — só desta sessão (`use-session-layout.ts`).
 *
 * Os drawers são irmãos do `<Screen>`, dentro de `<DrawerLayer>`: o bottom sheet
 * nativo não é portal e, declarado dentro do card, abriria com a altura dele
 * (ver o cabeçalho de `ui/drawer.tsx`).
 */
export function ActiveSession({
  session,
  refreshing,
  onRefresh,
}: {
  session: WorkoutSession;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  // A tela apagando no meio da série obrigaria a desbloquear o celular com a
  // mão que está segurando a barra — é o ganho nativo mais direto da issue.
  useKeepAwake();
  const exit = useSessionExitGuard();

  const rest = useRestTimer();
  const cancel = useCancelSession(session.id);
  const layout = useSessionLayout(session);
  const scrollRef = useRef<ScrollView>(null);

  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rpeTarget, setRpeTarget] = useState<SessionSet | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ExerciseGroup | null>(null);

  // Escolhidos na busca e ainda sem série: vivem só na tela (ver `buildExerciseGroups`).
  const [pending, setPending] = useState<PendingExercise[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(null);

  const groups = useMemo(
    () =>
      orderExerciseGroups(
        buildExerciseGroups(session.plannedExercises, session.sets, pending),
        session.exerciseOrder,
      ),
    [session.plannedExercises, session.sets, session.exerciseOrder, pending],
  );

  const focused = pickFocusedGroup(groups, skipped, pickedId);

  const others = groups.filter((group) => group.exerciseId !== focused?.exerciseId);

  function skipExercise(exerciseId: number) {
    setSkipped((current) => new Set(current).add(exerciseId));
  }

  /** Traz o exercício para o foco — inclusive um que a pessoa tinha pulado. */
  function doNow(exerciseId: number) {
    setSkipped((current) => {
      const next = new Set(current);
      next.delete(exerciseId);
      return next;
    });
    setPickedId(exerciseId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  /**
   * Move entre os cards de baixo, e o que está em foco fica onde estava na
   * ordem: senão, mexer em dois exercícios lá embaixo mudaria qual vem depois
   * do atual.
   */
  function move(exerciseId: number, direction: 'up' | 'down') {
    const ids = moveExerciseInOrder(others, exerciseId, direction);
    if (focused) {
      const index = groups.findIndex((g) => g.exerciseId === focused.exerciseId);
      ids.splice(index, 0, focused.exerciseId);
    }
    layout.reorder.mutate(ids);
  }

  function removeExercise(group: ExerciseGroup) {
    setRemoveTarget(null);
    setPending((current) => current.filter((p) => p.id !== group.exerciseId));
    if (pickedId === group.exerciseId) setPickedId(null);
    // Escolhido na busca e ainda sem série: só existia na tela.
    if (!group.isPlanned && group.sets.length === 0) return;
    layout.remove.mutate(group);
  }

  /** Sem série registrada não há o que perder: tira direto, sem perguntar. */
  function requestRemove(group: ExerciseGroup) {
    if (group.sets.length === 0) removeExercise(group);
    else setRemoveTarget(group);
  }

  return (
    <>
      <ExerciseDetailHost>
        <Screen title="Treino em andamento" scroll={false} onBack={exit.requestExit}>
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={cores.primary}
                colors={[cores.primary]}
              />
            }
          >
            <SessionHeader
              startedAt={session.startedAt}
              progress={sessionProgress(groups)}
              onCancel={() => cancel.setCancelOpen(true)}
              onFinish={() => setFinishOpen(true)}
            />

            {groups.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                Nenhum exercício registrado ainda. Adicione o primeiro abaixo.
              </Text>
            ) : null}

            {focused && !focused.isCardio ? (
              // `key` por exercício: sem ela o React reaproveita a instância ao
              // trocar o foco, e a carga digitada no exercício anterior
              // continuaria no campo do próximo.
              <ActiveExerciseCard
                key={focused.exerciseId}
                sessionId={session.id}
                sessionStartedAt={session.startedAt}
                group={focused}
                rest={rest}
                onFinishExercise={() => skipExercise(focused.exerciseId)}
                onAskRpe={setRpeTarget}
              />
            ) : null}

            {focused && focused.isCardio ? (
              <ActiveCardioCard
                key={focused.exerciseId}
                sessionId={session.id}
                group={focused}
                onFinishExercise={() => skipExercise(focused.exerciseId)}
              />
            ) : null}

            {focused ? (
              <Button
                variant="ghost"
                size="sm"
                className="-mt-2 self-center"
                textClassName="text-muted-foreground"
                onPress={() => requestRemove(focused)}
              >
                Tirar este exercício do treino
              </Button>
            ) : null}

            {!focused && groups.length > 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-sm font-bold text-foreground">Tudo feito por aqui.</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Finalize o treino no topo, ou adicione outro exercício abaixo.
                </Text>
              </View>
            ) : null}

            {others.length > 0 ? (
              <Text className="mt-2 text-[11px] font-extrabold tracking-wide text-muted-foreground">
                {focused ? 'PRÓXIMOS' : 'EXERCÍCIOS DO TREINO'}
              </Text>
            ) : null}

            {others.map((group, index) => (
              <ExerciseDetailCard
                key={group.exerciseId}
                mode="readonly"
                isCardio={group.isCardio}
                sessionId={session.id}
                item={groupCardItem(group)}
                loggedSets={group.sets}
                renderSet={(args) => <SetRow {...args} onEditRpe={setRpeTarget} />}
                footer={
                  <ExerciseActions
                    group={group}
                    isFirst={index === 0}
                    isLast={index === others.length - 1}
                    disabled={layout.reorder.isPending}
                    onDoNow={() => doNow(group.exerciseId)}
                    onMove={(direction) => move(group.exerciseId, direction)}
                    onRemove={() => requestRemove(group)}
                  />
                }
              />
            ))}

            <Button variant="outline" className="rounded-2xl" onPress={() => setSearchOpen(true)}>
              <Plus size={16} color={cores.foreground} />
              <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
            </Button>
          </ScrollView>
        </Screen>
      </ExerciseDetailHost>

      <DrawerLayer>
        <ExerciseSearchDrawer
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onPick={(exercise) => {
            setPending((prev) => [...prev, exercise]);
            setPickedId(exercise.id);
          }}
        />
        <RpeDrawer
          open={rpeTarget != null}
          onOpenChange={(open) => {
            if (!open) setRpeTarget(null);
          }}
          sessionId={session.id}
          set={rpeTarget}
        />
        <FinishSessionDrawer open={finishOpen} onOpenChange={setFinishOpen} session={session} />
        <ConfirmDrawer
          open={removeTarget != null}
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          title={`Tirar ${removeTarget?.exerciseName ?? 'exercício'} do treino?`}
          description={
            removeTarget
              ? `${removeTarget.sets.length === 1 ? 'A série registrada será apagada' : `As ${removeTarget.sets.length} séries registradas serão apagadas`}. O plano não muda: ele volta no próximo treino.`
              : undefined
          }
          confirmLabel="Tirar do treino"
          destructive
          onConfirm={() => removeTarget && removeExercise(removeTarget)}
        />
        <ConfirmDrawer
          open={cancel.cancelOpen}
          onOpenChange={cancel.setCancelOpen}
          title="Cancelar treino?"
          description="Isso apaga a sessão e todos os exercícios registrados. Não dá para desfazer."
          confirmLabel="Cancelar treino"
          cancelLabel="Continuar treinando"
          destructive
          loading={cancel.isPending}
          error={cancel.error}
          onConfirm={cancel.cancel}
        />
        <ConfirmDrawer
          open={exit.exitOpen}
          onOpenChange={exit.setExitOpen}
          title="Sair do treino?"
          description='O treino continua em andamento. Dá para voltar a ele pelo "Continuar treino", na tela de treinos.'
          confirmLabel="Sair por enquanto"
          cancelLabel="Continuar treinando"
          onConfirm={exit.leave}
        />
      </DrawerLayer>
    </>
  );
}

/**
 * O pé de cada card da lista: "Fazer agora" à esquerda, que é o que se procura
 * no meio do treino, e as ações de arrumação à direita, menores.
 */
function ExerciseActions({
  group,
  isFirst,
  isLast,
  disabled,
  onDoNow,
  onMove,
  onRemove,
}: {
  group: ExerciseGroup;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onDoNow: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
}) {
  const target = group.targetSets ?? 0;
  const done = group.isCardio ? group.sets.length > 0 : target > 0 && group.sets.length >= target;

  return (
    <View className="mt-3 flex-row items-center gap-1 border-t border-border pt-3">
      {done ? (
        <Text className="flex-1 text-xs font-bold text-primary">✓ Concluído</Text>
      ) : (
        <Button
          size="sm"
          className="mr-auto rounded-full px-4"
          accessibilityLabel={`Fazer ${group.exerciseName} agora`}
          onPress={onDoNow}
        >
          <Play size={14} color={cores.primaryForeground} fill={cores.primaryForeground} />
          <Text className="text-xs font-extrabold text-primary-foreground">Fazer agora</Text>
        </Button>
      )}

      <IconAction
        label={`Mover ${group.exerciseName} para cima`}
        disabled={isFirst || disabled}
        onPress={() => onMove('up')}
      >
        <ChevronUp size={20} color={isFirst || disabled ? cores.border : cores.foreground} />
      </IconAction>
      <IconAction
        label={`Mover ${group.exerciseName} para baixo`}
        disabled={isLast || disabled}
        onPress={() => onMove('down')}
      >
        <ChevronDown size={20} color={isLast || disabled ? cores.border : cores.foreground} />
      </IconAction>
      <IconAction label={`Tirar ${group.exerciseName} deste treino`} onPress={onRemove}>
        <Trash2 size={18} color={cores.danger} />
      </IconAction>
    </View>
  );
}

function IconAction({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full border border-border active:bg-accent"
    >
      {children}
    </Pressable>
  );
}

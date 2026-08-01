import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Plus } from 'lucide-react-native';
import { buildExerciseGroups, type SessionSet, type WorkoutSession } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { Button, DrawerLayer } from '@/components/ui';
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
import { useRestTimer } from './use-rest-timer';

/**
 * Sessão em andamento — o `ActiveSession` de `apps/web/src/app/(app)/workout/page.tsx`,
 * que no PWA vive dentro da tela de treinos porque lá não existe rota de sessão.
 *
 * Um exercício por vez fica em foco (o primeiro incompleto que não foi pulado) e
 * os demais aparecem abaixo em modo leitura, editáveis série a série. É o mesmo
 * recorte do PWA: no meio do treino, decidir onde tocar já é esforço demais.
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
  const confirmExit = useSessionExitGuard();

  const rest = useRestTimer();
  const { confirmCancel } = useCancelSession(session.id);

  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [rpeTarget, setRpeTarget] = useState<SessionSet | null>(null);

  const groups = useMemo(
    () => buildExerciseGroups(session.plannedExercises, session.sets),
    [session.plannedExercises, session.sets],
  );

  const focused = groups.find((group) => {
    if (skipped.has(group.exerciseId)) return false;
    if (group.isCardio) return group.sets.length === 0;
    const target = group.targetSets ?? 0;
    return target === 0 || group.sets.length < target;
  });

  const others = groups.filter((group) => group.exerciseId !== focused?.exerciseId);

  function skipExercise(exerciseId: number) {
    setSkipped((current) => new Set(current).add(exerciseId));
  }

  return (
    <>
      <ExerciseDetailHost>
        <Screen back title="Treino" scroll={false} onBack={confirmExit}>
          <SessionHeader
            startedAt={session.startedAt}
            progress={sessionProgress(groups)}
            onCancel={confirmCancel}
            onFinish={() => setFinishOpen(true)}
          />

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#2ce500"
                colors={['#2ce500']}
              />
            }
          >
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

            {!focused && groups.length > 0 ? (
              <View className="rounded-2xl border border-border bg-card p-4">
                <Text className="text-sm font-bold text-foreground">Tudo feito por aqui.</Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  Finalize o treino no topo, ou adicione outro exercício abaixo.
                </Text>
              </View>
            ) : null}

            {others.map((group) => (
              <ExerciseDetailCard
                key={group.exerciseId}
                mode="readonly"
                isCardio={group.isCardio}
                sessionId={session.id}
                item={groupCardItem(group)}
                loggedSets={group.sets}
                renderSet={(args) => <SetRow {...args} onEditRpe={setRpeTarget} />}
              />
            ))}

            <Button variant="outline" className="rounded-2xl" onPress={() => setSearchOpen(true)}>
              <Plus size={16} color="#e5e2e1" />
              <Text className="text-sm font-medium text-foreground">Adicionar exercício</Text>
            </Button>
          </ScrollView>
        </Screen>
      </ExerciseDetailHost>

      <DrawerLayer>
        <ExerciseSearchDrawer
          open={searchOpen}
          onOpenChange={setSearchOpen}
          sessionId={session.id}
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
      </DrawerLayer>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Clock, Dumbbell } from 'lucide-react-native';
import { buildExerciseGroups, type SessionSet, type WorkoutSession } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { DrawerLayer } from '@/components/ui';
import { formatInteger } from '@/components/charts';
import { ExerciseDetailCard } from '@/components/workout/exercise-detail-card';
import { ExerciseDetailHost } from '@/components/workout/exercise-detail-host';
import { groupCardItem } from './exercise-card-item';
import { RpeDrawer } from './rpe-drawer';
import { SetRow } from './set-row';
import { elapsedLabel, formatSessionDate, pluralize, totalVolumeKg } from './format';

/**
 * Réplica de `apps/web/src/app/(app)/workout/session/[id]/page.tsx` — a mesma
 * rota serve a sessão terminada, que é como o histórico chega aqui.
 *
 * As séries continuam editáveis (sem excluir, como no PWA): corrigir a carga que
 * saiu errada é o motivo mais comum de abrir um treino do passado.
 */
export function CompletedSession({
  session,
  refreshing,
  onRefresh,
}: {
  session: WorkoutSession;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [rpeTarget, setRpeTarget] = useState<SessionSet | null>(null);

  const groups = useMemo(
    () => buildExerciseGroups(session.plannedExercises, session.sets),
    [session.plannedExercises, session.sets],
  );

  const totalSets = session.sets?.length ?? 0;
  const volume = totalVolumeKg(session.sets);
  const dateLabel = formatSessionDate(session.startedAt);
  const duration = session.completedAt
    ? elapsedLabel(session.startedAt, session.completedAt)
    : 'Em andamento';

  return (
    <>
      <ExerciseDetailHost>
        <Screen back title="Treino" refreshing={refreshing} onRefresh={onRefresh}>
          <View className="gap-4 px-5 pb-4 pt-2">
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <View className="gap-1 bg-accent p-4 pt-10">
                <View className="absolute left-4 top-4 rounded-md bg-primary px-2 py-0.5">
                  <Text className="text-[10px] font-extrabold text-primary-foreground">
                    CONCLUÍDO
                  </Text>
                </View>
                <Text
                  accessibilityRole="header"
                  className="text-2xl font-extrabold capitalize text-foreground"
                >
                  {dateLabel}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {groups.length} {pluralize(groups.length, 'exercício', 'exercícios')} •{' '}
                  {totalSets} {pluralize(totalSets, 'série', 'séries')}
                </Text>
              </View>

              <View className="flex-row items-center gap-6 border-t border-border px-5 py-3">
                <Stat icon={Clock} label="Duração" value={duration} />
                <Stat
                  icon={Dumbbell}
                  label="Volume"
                  value={volume > 0 ? `${formatInteger(volume)} kg` : '—'}
                />
              </View>
            </View>

            {session.notes ? (
              <View className="rounded-2xl border border-border bg-card px-4 py-3">
                <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">
                  OBSERVAÇÕES
                </Text>
                <Text className="mt-1 text-sm text-foreground">{session.notes}</Text>
              </View>
            ) : null}

            <Text accessibilityRole="header" className="text-base font-extrabold text-foreground">
              Exercícios{' '}
              <Text className="text-sm font-bold text-muted-foreground">({groups.length})</Text>
            </Text>

            <View className="gap-3">
              {groups.map((group) => (
                <ExerciseDetailCard
                  key={group.exerciseId}
                  mode="readonly"
                  isCardio={group.isCardio}
                  sessionId={session.id}
                  canDeleteSet={false}
                  item={groupCardItem(group)}
                  loggedSets={group.sets}
                  renderSet={(args) => <SetRow {...args} onEditRpe={setRpeTarget} />}
                />
              ))}
            </View>
          </View>
        </Screen>
      </ExerciseDetailHost>

      <DrawerLayer>
        <RpeDrawer
          open={rpeTarget != null}
          onOpenChange={(open) => {
            if (!open) setRpeTarget(null);
          }}
          sessionId={session.id}
          set={rpeTarget}
        />
      </DrawerLayer>
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={14} color="#2ce500" />
      <View>
        <Text className="text-[10px] font-bold tracking-wide text-muted-foreground">{label}</Text>
        <Text className="text-sm font-extrabold text-foreground">{value}</Text>
      </View>
    </View>
  );
}

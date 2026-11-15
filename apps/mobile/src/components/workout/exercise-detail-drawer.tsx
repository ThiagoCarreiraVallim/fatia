import { useState } from 'react';
import { Image, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil } from 'lucide-react-native';
import {
  feelingOf,
  formatBestSet,
  formatDecimal,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Text } from '@/components/ui/text';
import {
  Button,
  Drawer,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
  LoadingState,
  Segmented,
} from '@/components/ui';
import { ExerciseEditDrawer } from './exercise-edit-drawer';
import { ExerciseVideo } from './exercise-media';
import { muscleLabelPt } from './muscle-labels';
import { MuscleDiagram } from './muscle-diagram';
import { groupColorName } from './workout-home';
import { colors } from '@/theme/colors';

/**
 * "Como fazer" (prancha `Al-T9-Como-fazer`, #377): o vídeo, o nome com o
 * grupo e "equipamento · nível · mecânica", e três abas — Passos (com a dica
 * da comunidade), Músculos e Seu histórico (recorde, última vez, máximo
 * estimado).
 *
 * TODO(#378): a estrela de favorito do canvas entra com os favoritos.
 */

interface Props {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'iniciante',
  intermediate: 'intermediário',
  advanced: 'avançado',
};

const MECHANIC_LABEL: Record<string, string> = {
  compound: 'composto',
  isolation: 'isolado',
};

type Tab = 'steps' | 'muscles' | 'history';

const TABS: { value: Tab; label: string }[] = [
  { value: 'steps', label: 'Passos' },
  { value: 'muscles', label: 'Músculos' },
  { value: 'history', label: 'Seu histórico' },
];

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'd MMM', { locale: ptBR }).replace('.', '');
}

export function ExerciseDetailDrawer({ exercise, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [tab, setTab] = useState<Tab>('steps');

  // Editar um exercício base cria uma cópia editável; o custom é editado direto.
  const clone = useMutation({
    mutationFn: (id: number) => workoutApi.cloneExercise(id),
    onSuccess: (copy) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      if (exercise) void qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise.id] });
      onOpenChange(false);
      setEditing(copy);
    },
  });

  function handleEdit() {
    if (!exercise) return;
    if (exercise.source === 'CUSTOM') {
      onOpenChange(false);
      setEditing(exercise);
    } else {
      clone.mutate(exercise.id);
    }
  }

  const meta = exercise
    ? [
        exercise.equipment,
        exercise.level ? (LEVEL_LABEL[exercise.level] ?? exercise.level) : null,
        exercise.mechanic ? (MECHANIC_LABEL[exercise.mechanic] ?? exercise.mechanic) : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      {exercise ? (
        <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['90%']}>
          <DrawerHeader>
            <DrawerTitle>{exercise.name}</DrawerTitle>
          </DrawerHeader>

          <DrawerScrollView className="flex-1 px-4">
            <View className="gap-4 pb-6">
              <ExerciseVideo exerciseId={exercise.id} exerciseName={exercise.name} height={180} />

              <View className="gap-1.5">
                {exercise.muscleGroup ? (
                  <View className="flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1">
                    <View
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: colors[groupColorName(exercise.muscleGroup)] }}
                    />
                    <Text className="text-[12px] font-sans-bold capitalize text-foreground">
                      {exercise.muscleGroup}
                    </Text>
                  </View>
                ) : null}
                {meta.length > 0 ? (
                  <Text className="text-[13px] text-muted-foreground">{meta.join(' · ')}</Text>
                ) : null}
              </View>

              <Segmented
                label="Seções do Como fazer"
                options={TABS}
                value={tab}
                onChange={setTab}
              />

              {tab === 'steps' ? <StepsTab exercise={exercise} /> : null}
              {tab === 'muscles' ? <MusclesTab exercise={exercise} /> : null}
              {tab === 'history' ? <HistoryTab exerciseId={exercise.id} /> : null}

              {/* Por último, rolando com o conteúdo: editar é raro. */}
              <Button
                variant="ghost"
                loading={clone.isPending}
                onPress={handleEdit}
                className="mt-2 self-center"
              >
                <Pencil size={14} color={colors.mutedForeground} />
                <Text className="text-xs font-medium text-muted-foreground">
                  {exercise.source === 'CUSTOM'
                    ? 'Editar exercício'
                    : 'Editar (cria uma cópia sua)'}
                </Text>
              </Button>
            </View>
          </DrawerScrollView>

          <DrawerFooter>
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DrawerFooter>
        </Drawer>
      ) : null}

      <ExerciseEditDrawer
        exercise={editing}
        open={Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </>
  );
}

function StepsTab({ exercise }: { exercise: Exercise }) {
  const guide = exercise.community ?? null;
  const photos = guide?.photos.filter((f) => f.url) ?? [];
  return (
    <View className="gap-3">
      {exercise.instructions.length > 0 ? (
        exercise.instructions.map((step, i) => (
          <View key={`${i}-${step.slice(0, 12)}`} className="flex-row gap-3">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-muted">
              <Text className="text-[12px] font-sans-bold text-foreground">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-sm leading-snug text-foreground">{step}</Text>
          </View>
        ))
      ) : (
        <Text className="text-sm text-muted-foreground">
          Sem passo a passo para este exercício.
        </Text>
      )}

      {guide?.tips ? (
        <View className="gap-1 rounded-2xl bg-muted p-3">
          <Text className="font-sans-bold text-[13px] text-foreground">
            Dica da {guide.groupName}
          </Text>
          <MarkdownLite source={guide.tips} />
        </View>
      ) : null}

      {photos.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((f, i) => (
            <Image
              key={f.id}
              source={{ uri: f.url! }}
              accessibilityLabel={`${exercise.name}, foto ${i + 1} da ${guide!.groupName}`}
              accessibilityIgnoresInvertColors
              className="h-36 w-[48%] rounded-xl"
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MusclesTab({ exercise }: { exercise: Exercise }) {
  if (exercise.primaryMuscles.length === 0) {
    return <Text className="text-sm text-muted-foreground">Sem músculos cadastrados.</Text>;
  }
  return (
    <View className="flex-row items-center gap-4">
      <MuscleDiagram
        primaryMuscles={exercise.primaryMuscles}
        secondaryMuscles={exercise.secondaryMuscles}
        width={72}
      />
      <View className="min-w-0 flex-1 gap-3">
        <View className="gap-1">
          <Text className="text-[12px] font-sans-bold text-muted-foreground">Principal</Text>
          {exercise.primaryMuscles.map((m) => (
            <View key={m} className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-primary" />
              <Text className="text-sm text-foreground">{muscleLabelPt(m)}</Text>
            </View>
          ))}
        </View>
        {exercise.secondaryMuscles.length > 0 ? (
          <View className="gap-1">
            <Text className="text-[12px] font-sans-bold text-muted-foreground">Ajudam</Text>
            {exercise.secondaryMuscles.map((m) => (
              <View key={m} className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.water }} />
                <Text className="text-sm text-foreground">{muscleLabelPt(m)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HistoryTab({ exerciseId }: { exerciseId: number }) {
  const stats = useQuery({
    queryKey: ['workout', 'exercise', exerciseId, 'stats'],
    queryFn: () => workoutApi.getExerciseStats(exerciseId),
  });
  if (stats.isLoading) return <LoadingState />;
  const s = stats.data;
  if (!s || (!s.record && !s.last)) {
    return (
      <Text className="text-sm text-muted-foreground">
        Você ainda não fez este exercício. O histórico aparece depois da primeira série.
      </Text>
    );
  }
  const lastFeeling = feelingOf(s.last?.feeling);
  return (
    <View className="gap-2">
      {s.record ? (
        <Row
          label="Recorde"
          detail={shortDate(s.record.date)}
          value={formatBestSet({ ...s.record, avgHeartRate: null })}
        />
      ) : null}
      {s.last ? (
        <Row
          label="Última vez"
          detail={[
            shortDate(s.last.date),
            `${s.last.sets} ${s.last.sets === 1 ? 'série' : 'séries'}`,
            lastFeeling?.emoji,
          ]
            .filter(Boolean)
            .join(' · ')}
          value={formatBestSet({ ...s.last.best, avgHeartRate: null })}
        />
      ) : null}
      {s.estimated1RM != null ? (
        <Row label="Máximo estimado" value={`~${formatDecimal(s.estimated1RM, 0)} kg`} />
      ) : null}
    </View>
  );
}

function Row({ label, detail, value }: { label: string; detail?: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}${detail ? `, ${detail}` : ''}: ${value}`}
      className="flex-row items-center gap-3 rounded-2xl bg-muted px-4 py-3"
    >
      <View className="min-w-0 flex-1">
        <Text className="font-sans-bold text-sm text-foreground">{label}</Text>
        {detail ? <Text className="text-[12px] text-muted-foreground">{detail}</Text> : null}
      </View>
      <Text className="font-sans-bold text-base text-foreground">{value}</Text>
    </View>
  );
}

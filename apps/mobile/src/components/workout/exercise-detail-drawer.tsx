import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Star } from 'lucide-react-native';
import { workoutApi, type Exercise } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
} from '@/components/ui';
import { CommunityGuideSection } from './community-guide';
import { ExerciseEditDrawer } from './exercise-edit-drawer';
import { MuscleDiagram } from './muscle-diagram';
import { colors } from '@/theme/colors';

/**
 * Réplica de `apps/web/src/components/workout/exercise-detail-drawer.tsx`.
 */

interface Props {
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

const MECHANIC_LABEL: Record<string, string> = {
  compound: 'Composto',
  isolation: 'Isolado',
};

function Badge({ children }: { children: string }) {
  return (
    <View className="rounded-full bg-muted px-3 py-1">
      <Text className="text-xs font-semibold capitalize text-foreground">{children}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </Text>
  );
}

export function ExerciseDetailDrawer({ exercise, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Exercise | null>(null);

  // Editar um exercício base cria uma cópia editável (a base some das listagens
  // do usuário e aparece a cópia). Exercício custom é editado direto.
  const clone = useMutation({
    mutationFn: (id: number) => workoutApi.cloneExercise(id),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      if (exercise) qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise.id] });
      onOpenChange(false);
      setEditing(copy);
    },
  });

  // A estrela do Como fazer (#378), igual à do PWA: otimista e volta atrás se
  // a API recusar.
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [lastId, setLastId] = useState(exercise?.id);
  if (lastId !== exercise?.id) {
    setLastId(exercise?.id);
    setFavorite(null);
  }
  const isFavorite = favorite ?? exercise?.favorite ?? false;
  const favoriteMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      workoutApi.setExerciseFavorite(id, value),
    onMutate: ({ value }) => setFavorite(value),
    onError: (_e, { value }) => setFavorite(!value),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['workout', 'exercise', id] });
    },
  });

  const guia = exercise?.community ?? null;
  // O vídeo da comunidade substitui o do YouTube (Fase 7b).
  const videoId =
    exercise && !guia?.video?.url
      ? (exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId ?? null)
      : null;

  function handleEdit() {
    if (!exercise) return;
    if (exercise.source === 'CUSTOM') {
      onOpenChange(false);
      setEditing(exercise);
    } else {
      clone.mutate(exercise.id);
    }
  }

  return (
    <>
      {exercise ? (
        <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
          <DrawerHeader>
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <DrawerTitle>{exercise.name}</DrawerTitle>
                {exercise.muscleGroup ? (
                  <DrawerDescription className="capitalize">
                    {exercise.muscleGroup}
                  </DrawerDescription>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Favoritar ${exercise.name}`}
                accessibilityState={{ selected: isFavorite, disabled: favoriteMutation.isPending }}
                disabled={favoriteMutation.isPending}
                onPress={() => favoriteMutation.mutate({ id: exercise.id, value: !isFavorite })}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-accent"
              >
                <Star
                  size={22}
                  color={isFavorite ? colors.primaryText : colors.mutedForeground}
                  fill={isFavorite ? colors.primaryText : 'transparent'}
                />
              </Pressable>
            </View>
            {favoriteMutation.isError ? (
              <Text accessibilityRole="alert" className="text-xs text-danger">
                Não foi possível salvar o favorito. Tente de novo.
              </Text>
            ) : null}
          </DrawerHeader>

          <DrawerScrollView className="flex-1 px-4">
            <View className="gap-5 pb-6">
              {guia ? <CommunityGuideSection guide={guia} exerciseName={exercise.name} /> : null}

              {exercise.primaryMuscles && exercise.primaryMuscles.length > 0 ? (
                <MuscleDiagram
                  primaryMuscles={exercise.primaryMuscles}
                  secondaryMuscles={exercise.secondaryMuscles ?? []}
                />
              ) : null}

              <View className="flex-row flex-wrap gap-2">
                {exercise.level ? (
                  <Badge>{LEVEL_LABEL[exercise.level] ?? exercise.level}</Badge>
                ) : null}
                {exercise.mechanic ? (
                  <Badge>{MECHANIC_LABEL[exercise.mechanic] ?? exercise.mechanic}</Badge>
                ) : null}
                {exercise.equipment ? <Badge>{exercise.equipment}</Badge> : null}
              </View>

              {exercise.primaryMuscles && exercise.primaryMuscles.length > 0 ? (
                <View className="gap-1">
                  <SectionTitle>Músculos principais</SectionTitle>
                  <Text className="text-sm capitalize text-foreground">
                    {exercise.primaryMuscles.join(', ')}
                  </Text>
                  {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 ? (
                    <>
                      <View className="mt-2">
                        <SectionTitle>Músculos secundários</SectionTitle>
                      </View>
                      <Text className="text-sm capitalize text-foreground">
                        {exercise.secondaryMuscles.join(', ')}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : null}

              {exercise.instructions && exercise.instructions.length > 0 ? (
                <View className="gap-2">
                  <SectionTitle>Instruções</SectionTitle>
                  {exercise.instructions.map((step, i) => (
                    <View key={`${i}-${step.slice(0, 12)}`} className="flex-row gap-3">
                      <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-accent">
                        <Text className="text-[10px] font-bold text-primary">{i + 1}</Text>
                      </View>
                      <Text className="flex-1 text-sm leading-snug text-foreground">{step}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {videoId ? (
                <View className="gap-2">
                  <SectionTitle>Vídeo demonstrativo</SectionTitle>
                  {/* O PWA embute um iframe do YouTube. Aqui não há WebView no
                      projeto e adicionar uma é uma dependência nova — o vídeo
                      abre no app do YouTube, que é o comportamento que a pessoa
                      espera de um link de vídeo no celular. */}
                  <Button
                    variant="outline"
                    accessibilityLabel={`Abrir demonstração de ${exercise.name} no YouTube`}
                    onPress={() => {
                      void Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
                    }}
                  >
                    <ExternalLink size={16} color={colors.foreground} />
                    <Text className="text-sm font-medium text-foreground">Assistir no YouTube</Text>
                  </Button>
                </View>
              ) : null}

              {/* Por último, rolando com o conteúdo. Fixo no topo, o "editar"
                  era a primeira coisa do detalhe e empurrava para baixo o que a
                  pessoa veio ver — como se faz o exercício. Editar é raro. */}
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

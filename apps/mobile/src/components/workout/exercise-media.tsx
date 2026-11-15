import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, Info, Play } from 'lucide-react-native';
import {
  SIGNED_VIDEO_REFRESH_MS,
  workoutApi,
  youtubeThumbnail,
  type Exercise,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { useOpenExerciseDetail } from './exercise-detail-host';
import { MuscleDiagram } from './muscle-diagram';
import { colors } from '@/theme/colors';

/**
 * O vídeo do exercício no app (pranchas `Al-T3-Sessao` e `Al-T9-Como-fazer`).
 *
 * Sem player embutido: o projeto não tem `expo-video` nem WebView, e uma
 * dependência nativa nova quebraria o Expo Go. Então é a miniatura com o botão
 * de play, que abre o vídeo no navegador do sistema — que toca o YouTube e o
 * MP4/MOV da comunidade.
 *
 * O vídeo da comunidade vem com URL assinada que vence em 10 min: se o
 * exercício foi buscado há mais de `SIGNED_VIDEO_REFRESH_MS`, busca de novo
 * antes de abrir, senão a pessoa cai num "acesso negado" no meio do treino.
 */

export function useExerciseDetail(exerciseId: number) {
  return useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId),
    enabled: exerciseId > 0,
    staleTime: 5 * 60_000,
  });
}

/** O vídeo que vale: o da comunidade substitui o do YouTube (Fase 7b). */
export function exerciseVideo(
  exercise: Exercise | undefined,
): { kind: 'community' } | { kind: 'youtube'; id: string } | null {
  if (!exercise) return null;
  if (exercise.community?.video?.url) return { kind: 'community' };
  const id = exercise.youtubeVideoIdPt ?? exercise.youtubeVideoId;
  return id ? { kind: 'youtube', id } : null;
}

export function ExerciseVideo({
  exerciseId,
  exerciseName,
  height = 190,
}: {
  exerciseId: number;
  exerciseName: string;
  height?: number;
}) {
  const detail = useExerciseDetail(exerciseId);
  const [opening, setOpening] = useState(false);
  const video = exerciseVideo(detail.data);
  if (!video) return null;

  async function open() {
    if (video?.kind === 'youtube') {
      void WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${video.id}`);
      return;
    }
    setOpening(true);
    try {
      let exercise = detail.data;
      if (Date.now() - detail.dataUpdatedAt > SIGNED_VIDEO_REFRESH_MS) {
        exercise = (await detail.refetch()).data;
      }
      const url = exercise?.community?.video?.url;
      if (url) await WebBrowser.openBrowserAsync(url);
    } finally {
      setOpening(false);
    }
  }

  const thumb = video.kind === 'youtube' ? youtubeThumbnail(video.id) : null;
  const groupName = detail.data?.community?.groupName;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Assistir o vídeo de ${exerciseName}`}
      accessibilityHint="Abre o vídeo no navegador"
      onPress={() => void open()}
      disabled={opening}
      style={{ height }}
      className="overflow-hidden rounded-3xl bg-surface-3"
    >
      {thumb ? (
        <Image
          source={{ uri: thumb }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}
      <View className="absolute inset-0 items-center justify-center bg-black/25">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-background/90">
          {opening ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <Play size={24} color={colors.foreground} fill={colors.foreground} />
          )}
        </View>
      </View>
      {groupName ? (
        <View className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2.5 py-1">
          <Text className="text-[11px] font-sans-bold text-foreground">vídeo da {groupName}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Sem vídeo (prancha `Al-T3d-Sessao-sem-video`): o equipamento, a dica da
 * comunidade, os músculos no boneco e o "Como fazer" — o que ajuda a fazer o
 * exercício quando não há o que assistir.
 */
export function ExerciseVisual({
  exerciseId,
  exerciseName,
}: {
  exerciseId: number;
  exerciseName: string;
}) {
  const detail = useExerciseDetail(exerciseId);
  const openDetail = useOpenExerciseDetail();
  const exercise = detail.data;
  if (exerciseVideo(exercise)) {
    return <ExerciseVideo exerciseId={exerciseId} exerciseName={exerciseName} />;
  }
  if (!exercise) return null;
  const tip = exercise.community?.tips?.trim();
  return (
    <View className="flex-row gap-3 rounded-3xl bg-card p-3">
      {exercise.primaryMuscles.length > 0 ? (
        <MuscleDiagram
          primaryMuscles={exercise.primaryMuscles}
          secondaryMuscles={exercise.secondaryMuscles}
          view="front"
          width={64}
        />
      ) : null}
      <View className="min-w-0 flex-1 gap-1.5">
        {exercise.equipment ? (
          <Text className="text-[12px] text-muted-foreground">
            Equipamento: <Text className="text-[12px] text-foreground">{exercise.equipment}</Text>
          </Text>
        ) : null}
        {tip ? (
          <Text numberOfLines={4} className="text-[13px] leading-[18px] text-foreground">
            {exercise.community?.groupName ? `Dica da ${exercise.community.groupName}: ` : ''}
            {tip}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Como fazer ${exerciseName}`}
          onPress={() => openDetail(exerciseId)}
          className="mt-auto min-h-[44px] flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3.5"
        >
          <BookOpen size={15} color={colors.foreground} />
          <Text className="font-sans-bold text-[13px] text-foreground">Como fazer</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * O topo do exercício na sessão (pranchas `Al-T3` e `Al-T3d`): o grupo com a
 * cor e o equipamento, o nome grande, a dica da comunidade e o "Como fazer".
 * Sem vídeo, os músculos no boneco à direita; com vídeo, a miniatura vem antes.
 */
export function ExerciseHeading({
  exerciseId,
  exerciseName,
  groupColor,
  groupLabel,
}: {
  exerciseId: number;
  exerciseName: string;
  groupColor: string;
  groupLabel: string | null;
}) {
  const detail = useExerciseDetail(exerciseId);
  const openDetail = useOpenExerciseDetail();
  const exercise = detail.data;
  const hasVideo = exerciseVideo(exercise) != null;
  const tip = exercise?.community?.tips?.trim();
  return (
    <View className="gap-3">
      {hasVideo ? <ExerciseVideo exerciseId={exerciseId} exerciseName={exerciseName} /> : null}
      <View className="flex-row items-center gap-3 px-1">
        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            {groupLabel ? (
              <View className="flex-row items-center gap-1.5">
                <View
                  className="h-[7px] w-[7px] rounded-[2px]"
                  style={{ backgroundColor: groupColor }}
                />
                <Text className="font-sans-semibold text-[12px] text-muted-foreground">
                  {groupLabel}
                </Text>
              </View>
            ) : null}
            {exercise?.equipment ? (
              <Text className="text-[12px] text-faint">{exercise.equipment}</Text>
            ) : null}
          </View>
          <Text
            accessibilityRole="header"
            className="font-display text-[26px] leading-[29px] text-foreground"
          >
            {exerciseName}
          </Text>
          {tip ? (
            <Text numberOfLines={4} className="text-[13px] leading-[18px] text-foreground">
              {exercise?.community?.groupName ? `Dica da ${exercise.community.groupName}: ` : ''}
              {tip}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Como fazer ${exerciseName}`}
            onPress={() => openDetail(exerciseId)}
            className="h-[34px] flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3 active:opacity-80"
          >
            <Info size={16} color={colors.foreground} />
            <Text className="font-sans-bold text-[13px] text-foreground">Como fazer</Text>
          </Pressable>
        </View>
        {!hasVideo && exercise && exercise.primaryMuscles.length > 0 ? (
          <MuscleDiagram
            primaryMuscles={exercise.primaryMuscles}
            secondaryMuscles={exercise.secondaryMuscles}
            view="front"
            width={84}
          />
        ) : null}
      </View>
    </View>
  );
}

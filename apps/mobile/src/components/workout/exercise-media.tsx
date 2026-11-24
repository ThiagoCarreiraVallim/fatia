import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ExternalLink, Info, Play } from 'lucide-react-native';
import {
  communityVideoRecovery,
  exerciseVideoSource,
  signedVideoIsStale,
  workoutApi,
  youtubeHeroThumbnails,
  youtubeWatchUrl,
  type Exercise,
} from '@fatia/api-client';
import { Text } from '@/components/ui/text';
import { useOpenExerciseDetail } from './exercise-detail-context';
import { CommunityVideoPlayer, YouTubePlayer } from './exercise-video-player';
import { MuscleDiagram } from './muscle-diagram';
import { colors } from '@/theme/colors';

/**
 * O vídeo do exercício no app (pranchas `Al-T3-Sessao` e `Al-T9-Como-fazer`).
 *
 * O vídeo ocupa o topo inteiro, sangrando até as bordas, com o gradiente da
 * prancha (`rgba(0,0,0,.55)` em cima, transparente no meio e a cor do fundo
 * embaixo) fundindo com a tela. Tocar no play toca **ali mesmo**: YouTube pelo
 * embed `youtube-nocookie` numa WebView, vídeo da comunidade pelo `expo-video`
 * (`exercise-video-player.tsx`). Sem o player (build sem o nativo, falha ao
 * montar), cai no caminho antigo: o navegador do sistema.
 *
 * O vídeo da comunidade vem com URL assinada que vence em 10 min: se o
 * exercício foi buscado há mais de `SIGNED_VIDEO_REFRESH_MS`, busca de novo
 * antes de tocar, senão a pessoa cai num "acesso negado" no meio do treino.
 */

export function useExerciseDetail(exerciseId: number) {
  return useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId),
    enabled: exerciseId > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * O gradiente da prancha sobre o topo. Tocando, só a sombra de cima fica: a
 * de baixo cobriria os controles do player.
 */
export function HeroFade({ playing = false }: { playing?: boolean }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="exercise-hero-fade" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0.55} />
            <Stop offset={playing ? '0.16' : '0.28'} stopColor="#000" stopOpacity={0} />
            <Stop offset="0.5" stopColor={colors.background} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={playing ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#exercise-hero-fade)" />
      </Svg>
    </View>
  );
}

type PlayState = 'poster' | 'loading' | 'playing';

/**
 * O topo com vídeo, de borda a borda. `children` é o que vai **por cima** do
 * vídeo (voltar, estrela, "Como fazer"); o conteúdo que sobe sobre o fim do
 * gradiente fica com quem chama (`overlap`, devolvido por `onPlayingChange`).
 */
export function ExerciseVideoHero({
  exercise,
  dataUpdatedAt,
  refetch,
  height,
  onPlayingChange,
  children,
}: {
  exercise: Exercise;
  dataUpdatedAt: number;
  refetch: () => Promise<{ data?: Exercise }>;
  height: number;
  onPlayingChange?: (playing: boolean) => void;
  children?: ReactNode;
}) {
  const video = exerciseVideoSource(exercise);
  const [state, setState] = useState<PlayState>('poster');
  const [url, setUrl] = useState<string | null>(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const setPlaying = useCallback(
    (next: PlayState) => {
      setState(next);
      onPlayingChange?.(next === 'playing');
    },
    [onPlayingChange],
  );

  // Sem player embutido: o navegador do sistema, como antes.
  const fallback = useCallback(() => {
    setPlaying('poster');
    if (video?.kind === 'youtube') {
      const watch = youtubeWatchUrl(video.id);
      if (watch) void WebBrowser.openBrowserAsync(watch);
    }
  }, [setPlaying, video]);

  // O vídeo da comunidade falhou: a URL assinada pode ter vencido. Busca uma
  // nova antes de tentar de novo ou de abrir o navegador (nunca a vencida).
  const [retried, setRetried] = useState(false);
  const communityFailed = useCallback(async () => {
    if (!url) return fallback();
    setState('loading');
    const fresh = await refetch().then(
      (r) => r.data,
      () => undefined,
    );
    const next = exerciseVideoSource(fresh);
    const r = communityVideoRecovery({
      failedUrl: url,
      freshUrl: next?.kind === 'community' ? next.url : null,
      retried,
    });
    if (r.action === 'retry') {
      setRetried(true);
      setUrl(r.url);
      setPlaying('playing');
      return;
    }
    setPlaying('poster');
    if (r.action === 'browser') void WebBrowser.openBrowserAsync(r.url);
  }, [url, fallback, refetch, retried, setPlaying]);

  if (!video) return null;

  async function play() {
    if (video?.kind === 'youtube') {
      setPlaying('playing');
      return;
    }
    setState('loading');
    try {
      let fresh = exercise;
      if (signedVideoIsStale(dataUpdatedAt, Date.now())) fresh = (await refetch()).data ?? exercise;
      const next = exerciseVideoSource(fresh);
      if (next?.kind !== 'community') {
        setPlaying('poster');
        return;
      }
      setUrl(next.url);
      setRetried(false);
      setPlaying('playing');
    } catch {
      setPlaying('poster');
    }
  }

  const thumb =
    video.kind === 'youtube' ? (youtubeHeroThumbnails(video.id)[thumbIndex] ?? null) : null;
  const groupName = exercise.community?.groupName;
  const playing = state === 'playing';

  return (
    <View style={{ height }} className="w-full overflow-hidden bg-surface-3">
      {playing ? (
        <View style={StyleSheet.absoluteFill}>
          {video.kind === 'youtube' ? (
            <YouTubePlayer videoId={video.id} onUnavailable={fallback} />
          ) : url ? (
            <CommunityVideoPlayer
              key={url}
              url={url}
              onUnavailable={() => void communityFailed()}
            />
          ) : null}
        </View>
      ) : (
        <>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
              onError={() => setThumbIndex((i) => i + 1)}
            />
          ) : (
            <StripedBackdrop />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Assistir o vídeo de ${exercise.name}`}
            onPress={() => void play()}
            disabled={state === 'loading'}
            style={StyleSheet.absoluteFill}
            className="items-center justify-center"
          >
            <View className="h-16 w-16 items-center justify-center rounded-full bg-black/60">
              {state === 'loading' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Play size={26} color="#fff" fill="#fff" />
              )}
            </View>
          </Pressable>
        </>
      )}
      <HeroFade playing={playing} />
      {children}
      {groupName && !playing ? (
        <View
          pointerEvents="none"
          className="absolute rounded-full bg-black/60 px-2.5 py-1"
          style={{ right: 16, top: height * 0.62 }}
        >
          <Text className="text-[11px] font-sans-bold text-white">vídeo da {groupName}</Text>
        </View>
      ) : null}
      {playing && video.kind === 'youtube' ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Abrir no YouTube"
          onPress={fallback}
          hitSlop={8}
          className="absolute bottom-2 right-3 flex-row items-center gap-1 rounded-full bg-black/60 px-2.5 py-1"
        >
          <ExternalLink size={12} color="#fff" />
          <Text className="text-[11px] font-sans-bold text-white">YouTube</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** O fundo listrado da prancha, enquanto não há miniatura (vídeo da comunidade). */
function StripedBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} className="bg-surface-3">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="exercise-hero-stripes" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={colors.surface3} />
            <Stop offset="1" stopColor={colors.card} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#exercise-hero-stripes)" />
      </Svg>
    </View>
  );
}

/**
 * Sem vídeo (prancha `Al-T3d-Sessao-sem-video`): o que ajuda a fazer o
 * exercício quando não há o que assistir — o boneco com os músculos, do lado
 * e com o zoom do que é treinado, no lugar do vídeo, com o mesmo gradiente.
 */
export function ExerciseVisual({
  exercise,
  height,
  children,
}: {
  exercise: Exercise;
  height: number;
  children?: ReactNode;
}) {
  return (
    <View style={{ height }} className="w-full overflow-hidden bg-card">
      {exercise.primaryMuscles.length > 0 ? (
        <View
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
          // O boneco fica um pouco acima do meio: embaixo, o título sobe sobre o degradê.
        >
          <View style={{ marginTop: -height * 0.12 }}>
            {/* O lado e o recorte dos músculos treinados (#474); frente e costas
                inteiras ficam na aba "Músculos", logo abaixo. */}
            <MuscleDiagram
              primaryMuscles={exercise.primaryMuscles}
              secondaryMuscles={exercise.secondaryMuscles}
              view="auto"
              focus
              width={Math.round(height * 0.45)}
            />
          </View>
        </View>
      ) : null}
      <HeroFade />
      {children}
    </View>
  );
}

/**
 * O topo do exercício na sessão (pranchas `Al-T3` e `Al-T3d`): o grupo com a
 * cor e o equipamento, o nome grande, a dica da comunidade e o "Como fazer".
 *
 * - Com vídeo (`Al-T3`): o vídeo no fundo do topo, de borda a borda, por trás
 *   do cabeçalho da sessão; o "Como fazer" por cima dele, e o nome sobe sobre o
 *   fim do degradê. `bleed` diz quanto o topo precisa subir e sair para os
 *   lados para chegar às bordas (o padding da rolagem e o cabeçalho).
 * - Sem vídeo (`Al-T3d`): os músculos no boneco à direita.
 */
export function ExerciseHeading({
  exerciseId,
  exerciseName,
  groupColor,
  groupLabel,
  bleed,
}: {
  exerciseId: number;
  exerciseName: string;
  groupColor: string;
  groupLabel: string | null;
  bleed: { top: number; side: number; header: number };
}) {
  const detail = useExerciseDetail(exerciseId);
  const openDetail = useOpenExerciseDetail();
  const exercise = detail.data;
  const hasVideo = exerciseVideoSource(exercise) != null;
  const [playing, setPlaying] = useState(false);
  const tip = exercise?.community?.tips?.trim();

  const howTo = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Como fazer ${exerciseName}`}
      onPress={() => openDetail(exerciseId)}
      className={
        hasVideo
          ? 'h-[36px] flex-row items-center gap-1.5 self-start rounded-full bg-black/60 px-3.5 active:opacity-80'
          : 'h-[34px] flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3 active:opacity-80'
      }
    >
      {hasVideo ? <Play size={14} color="#fff" fill="#fff" /> : null}
      {!hasVideo ? <Info size={16} color={colors.foreground} /> : null}
      <Text
        className={
          hasVideo
            ? 'font-sans-bold text-[13px] text-white'
            : 'font-sans-bold text-[13px] text-foreground'
        }
      >
        Como fazer
      </Text>
    </Pressable>
  );

  // Prancha Al-T3: topo de 400 sob o cabeçalho; o nome começa ~120 antes do fim.
  const heroHeight = 400;
  const overlap = playing ? 0 : 120;

  return (
    <View className="gap-3">
      {hasVideo && exercise ? (
        <View style={{ marginTop: -bleed.top, marginHorizontal: -bleed.side }}>
          <ExerciseVideoHero
            exercise={exercise}
            dataUpdatedAt={detail.dataUpdatedAt}
            refetch={detail.refetch}
            height={heroHeight}
            onPlayingChange={setPlaying}
          >
            {playing ? null : (
              <View className="absolute" style={{ top: bleed.header + 8, left: bleed.side }}>
                {howTo}
              </View>
            )}
          </ExerciseVideoHero>
        </View>
      ) : null}
      <View
        className="flex-row items-center gap-3 px-1"
        style={hasVideo ? { marginTop: -overlap } : undefined}
      >
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
          {hasVideo && !playing ? null : howTo}
        </View>
        {!hasVideo && exercise && exercise.primaryMuscles.length > 0 ? (
          // #474: o lado dos músculos (costas na remada), com zoom neles e
          // maior que o boneco inteiro de 84 px de antes.
          <View className="overflow-hidden rounded-2xl bg-card">
            <MuscleDiagram
              primaryMuscles={exercise.primaryMuscles}
              secondaryMuscles={exercise.secondaryMuscles}
              view="auto"
              focus
              width={116}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

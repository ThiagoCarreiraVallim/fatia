import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, Pencil, Star } from 'lucide-react-native';
import {
  exerciseVideoSource,
  feelingOf,
  formatBestSet,
  howToMeta,
  kgToLoad,
  loadUnitLabel,
  formatDecimal,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Text } from '@/components/ui/text';
import { Button, DrawerLayer, LoadingState, Segmented, cn } from '@/components/ui';
import { ExerciseEditDrawer } from './exercise-edit-drawer';
import { ExerciseVideoHero, ExerciseVisual, useExerciseDetail } from './exercise-media';
import { muscleLabelPt } from './muscle-labels';
import { MuscleDiagram } from './muscle-diagram';
import { groupColorName } from './workout-home';
import { colors } from '@/theme/colors';
import { useUnitPrefs } from '@/components/you/use-unit-prefs';

/**
 * "Como fazer" (prancha `Al-T9-Como-fazer`, #377), em tela cheia: o vídeo
 * grande no topo, de borda a borda, com o voltar e a estrela por cima; o nome
 * com o grupo e "equipamento · nível · mecânica"; e três abas — Passos (com a
 * dica da comunidade), Músculos (o boneco completo, frente e costas) e Seu
 * histórico (recorde, última vez, máximo estimado). Sem vídeo, o boneco ocupa
 * o topo (`ExerciseVisual`, Al-T3d).
 *
 * "Erros comuns" da prancha fica de fora: o catálogo não tem esse dado.
 *
 * Era um drawer; virou rota (`/workout/exercise/:id`) e é tela de foco, sem a
 * barra de baixo. A sessão guiada que abriu esta tela volta no mesmo exercício
 * (`active-session.tsx`, pedido de foco).
 */

type Tab = 'steps' | 'muscles' | 'history';

const TABS: { value: Tab; label: string }[] = [
  { value: 'steps', label: 'Passos' },
  { value: 'muscles', label: 'Músculos' },
  { value: 'history', label: 'Seu histórico' },
];

/** Prancha Al-T9: topo de 360; o nome sobe ~110 sobre o fim do degradê. */
const HERO_HEIGHT = 360;
const HERO_OVERLAP = 110;

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'd MMM', { locale: ptBR }).replace('.', '');
}

/** `exerciseId` nulo: a rota não trouxe um exercício válido. */
export function ExerciseHowTo({ exerciseId }: { exerciseId: number | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const detail = useExerciseDetail(exerciseId ?? 0);
  const exercise = detail.data ?? null;
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [tab, setTab] = useState<Tab>('steps');
  const [playing, setPlaying] = useState(false);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/workout');
  };

  // Editar um exercício base cria uma cópia editável; o custom é editado direto.
  const clone = useMutation({
    mutationFn: (id: number) => workoutApi.cloneExercise(id),
    onSuccess: (copy) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'exercise', exerciseId] });
      setEditing(copy);
    },
  });

  // A estrela (#378), igual à do PWA: otimista e volta atrás se a API recusar.
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const isFavorite = favorite ?? exercise?.favorite ?? false;
  const favoriteMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) =>
      workoutApi.setExerciseFavorite(id, value),
    onMutate: ({ value }) => setFavorite(value),
    onError: (_e, { value }) => setFavorite(!value),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      void qc.invalidateQueries({ queryKey: ['workout', 'exercise', id] });
    },
  });

  function handleEdit() {
    if (!exercise) return;
    if (exercise.source === 'CUSTOM') setEditing(exercise);
    else clone.mutate(exercise.id);
  }

  // O voltar e a estrela, sobre o topo (escuros translúcidos: ficam sobre o vídeo).
  const overlay = (
    <View
      className="absolute inset-x-0 flex-row items-center justify-between px-4"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={back}
        className="h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-80"
      >
        <ChevronLeft size={22} color="#fff" />
      </Pressable>
      {exercise ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Favoritar ${exercise.name}`}
          accessibilityState={{ selected: isFavorite, disabled: favoriteMutation.isPending }}
          disabled={favoriteMutation.isPending}
          onPress={() => favoriteMutation.mutate({ id: exercise.id, value: !isFavorite })}
          className="h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-80"
        >
          <Star
            size={20}
            color={isFavorite ? colors.primary : '#fff'}
            fill={isFavorite ? colors.primary : 'transparent'}
          />
        </Pressable>
      ) : null}
    </View>
  );

  if (!exercise) {
    return (
      <View className="flex-1 bg-background">
        <View style={{ height: HERO_HEIGHT }} className="w-full bg-card" />
        {overlay}
        <View className="px-5 pt-4">
          {exerciseId == null || detail.isError ? (
            <Text className="text-sm text-danger">
              Não foi possível abrir o exercício. Volte e tente de novo.
            </Text>
          ) : (
            <LoadingState />
          )}
        </View>
      </View>
    );
  }

  const hasVideo = exerciseVideoSource(exercise) != null;
  const meta = howToMeta(exercise);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        // Com o vídeo tocando, o arrasto vertical é do player só dentro dele.
        keyboardShouldPersistTaps="handled"
      >
        {hasVideo ? (
          <ExerciseVideoHero
            exercise={exercise}
            dataUpdatedAt={detail.dataUpdatedAt}
            refetch={detail.refetch}
            height={HERO_HEIGHT}
            onPlayingChange={setPlaying}
          />
        ) : (
          <ExerciseVisual exercise={exercise} height={HERO_HEIGHT} />
        )}

        <View
          className="gap-4 px-5"
          style={{ marginTop: hasVideo && playing ? 16 : -HERO_OVERLAP }}
        >
          <View className="gap-2">
            <Text
              accessibilityRole="header"
              className="font-display text-[28px] leading-[32px] text-foreground"
            >
              {exercise.name}
            </Text>
            {/* Prancha `Al-T9`: "■ Peito  barra · intermediário · composto" numa linha. */}
            <View className="flex-row flex-wrap items-center gap-2">
              {exercise.muscleGroup ? (
                <View className="flex-row items-center gap-1.5">
                  <View
                    className="h-[7px] w-[7px] rounded-[2px]"
                    style={{ backgroundColor: colors[groupColorName(exercise.muscleGroup)] }}
                  />
                  <Text className="text-[13px] font-sans-semibold capitalize text-foreground">
                    {exercise.muscleGroup}
                  </Text>
                </View>
              ) : null}
              {meta ? <Text className="text-[13px] text-muted-foreground">{meta}</Text> : null}
            </View>
            {favoriteMutation.isError ? (
              <Text accessibilityRole="alert" className="text-xs text-danger">
                Não foi possível salvar o favorito. Tente de novo.
              </Text>
            ) : null}
          </View>

          <Segmented label="Seções do Como fazer" options={TABS} value={tab} onChange={setTab} />

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
              {exercise.source === 'CUSTOM' ? 'Editar exercício' : 'Editar (cria uma cópia sua)'}
            </Text>
          </Button>
        </View>
      </ScrollView>

      {playing ? null : overlay}
      {playing ? (
        // Tocando, só o voltar fica (a estrela cobriria o canto do player).
        <View className="absolute left-4" style={{ top: insets.top + 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={back}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-80"
          >
            <ChevronLeft size={22} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      <DrawerLayer>
        <ExerciseEditDrawer
          exercise={editing}
          open={Boolean(editing)}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      </DrawerLayer>
    </View>
  );
}

function StepsTab({ exercise }: { exercise: Exercise }) {
  const guide = exercise.community ?? null;
  const photos = guide?.photos.filter((f) => f.url) ?? [];
  return (
    <View className="gap-3">
      {exercise.instructions.length > 0 ? (
        // Prancha `Al-T9`: os passos num cartão, número no círculo verde, linha entre eles.
        <View className="rounded-card bg-card px-4">
          {exercise.instructions.map((step, i) => (
            <View
              key={`${i}-${step.slice(0, 12)}`}
              className={cn('flex-row gap-3 py-3.5', i > 0 && 'border-t border-border')}
            >
              <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                <Text className="text-[12px] font-sans-extrabold text-primary-foreground">
                  {i + 1}
                </Text>
              </View>
              <Text className="flex-1 text-sm leading-snug text-foreground">{step}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Sem passo a passo para este exercício.
        </Text>
      )}

      {guide?.tips ? (
        <View className="gap-1 rounded-card bg-card p-4">
          <Text className="font-sans-bold text-sm text-foreground">Dica da {guide.groupName}</Text>
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
    <View className="gap-4 rounded-card bg-card p-4">
      {/* O boneco completo, frente e costas (o mesmo SVG do resto do app). */}
      <View className="items-center">
        <MuscleDiagram
          primaryMuscles={exercise.primaryMuscles}
          secondaryMuscles={exercise.secondaryMuscles}
          view="both"
          width={120}
        />
      </View>
      <View className="flex-row gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[12px] font-sans-bold text-muted-foreground">Principal</Text>
          {exercise.primaryMuscles.map((m) => (
            <View key={m} className="flex-row items-center gap-2">
              <View className="h-2 w-2 rounded-full bg-primary" />
              <Text className="text-sm text-foreground">{muscleLabelPt(m)}</Text>
            </View>
          ))}
        </View>
        {exercise.secondaryMuscles.length > 0 ? (
          <View className="min-w-0 flex-1 gap-1">
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
  const units = useUnitPrefs();
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
          value={formatBestSet({ ...s.record, avgHeartRate: null }, units.loadUnit)}
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
          value={formatBestSet({ ...s.last.best, avgHeartRate: null }, units.loadUnit)}
        />
      ) : null}
      {s.estimated1RM != null ? (
        <Row
          label="Máximo estimado"
          value={`~${formatDecimal(kgToLoad(s.estimated1RM, units.loadUnit), 0)} ${loadUnitLabel(units.loadUnit)}`}
        />
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

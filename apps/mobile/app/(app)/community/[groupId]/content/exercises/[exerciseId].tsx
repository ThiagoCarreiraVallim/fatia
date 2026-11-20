import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { BookOpen, Check, Play, Plus } from 'lucide-react-native';
import {
  initialsOf,
  groupExerciseApi,
  SIGNED_VIDEO_REFRESH_MS,
  workoutApi,
  type WorkoutPlan,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
  EmptyState,
  LoadingState,
  cn,
} from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useOpenExerciseDetail } from '@/components/workout/exercise-detail-context';
import { colors } from '@/theme/colors';

/** Escolhe um dos meus planos para receber o exercício; o que já tem avisa. */
function PlanPickerDrawer({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: number;
  exerciseName: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const planos = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: (plan: WorkoutPlan) => workoutApi.addPlanExercise(plan.id, { exerciseId }),
    onSuccess: (_r, plan) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      toast.show({ message: `${exerciseName} entrou em ${plan.name}.` });
      onOpenChange(false);
    },
    onError: (e) =>
      toast.show({ message: apiMessage(e, 'Não deu para pôr no treino. Tente de novo.') }),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Pôr num treino</DrawerTitle>
          <DrawerDescription>{`Escolha o plano que vai receber ${exerciseName}.`}</DrawerDescription>
        </DrawerHeader>
        <View className="gap-2 px-4 pb-6 pt-2">
          {planos.isPending ? (
            <ActivityIndicator color={colors.mutedForeground} />
          ) : planos.isError ? (
            <Text className="text-sm text-muted-foreground">
              Não deu para carregar seus planos.
            </Text>
          ) : planos.data.length ? (
            planos.data.map((p) => {
              const jaTem = p.exercises.some((e) => e.exerciseId === exerciseId);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={jaTem ? `${p.name}, já tem` : p.name}
                  accessibilityState={{ disabled: jaTem || add.isPending }}
                  disabled={jaTem || add.isPending}
                  onPress={() => add.mutate(p)}
                  className={cn(
                    'min-h-[48px] flex-row items-center justify-between gap-3 rounded-2xl bg-card p-3 active:opacity-80',
                    jaTem && 'opacity-60',
                  )}
                >
                  <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">
                    {p.name}
                  </Text>
                  {jaTem ? (
                    <View className="flex-row items-center gap-1">
                      <Check size={14} color={colors.mutedForeground} />
                      <Text className="text-xs text-muted-foreground">já tem</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <Text className="text-sm text-muted-foreground">
              Você ainda não tem planos de treino. Crie um em Treino.
            </Text>
          )}
        </View>
      </DrawerContent>
    </Drawer>
  );
}

function GuideBody({ groupId, exerciseId }: { groupId: string; exerciseId: number }) {
  const openHowTo = useOpenExerciseDetail();
  const [foto, setFoto] = useState(0);
  const [escolhendo, setEscolhendo] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const guia = useQuery({
    queryKey: ['community', 'exercises', groupId, exerciseId],
    queryFn: () => groupExerciseApi.memberGuide(groupId, exerciseId),
    retry: false,
  });

  if (guia.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando o guia…" />
      </Screen>
    );
  }
  if (!guia.data) {
    return (
      <Screen>
        <View className="px-5 pt-4">
          <EmptyState
            title="Guia indisponível"
            description="A equipe tirou este guia do ar, ou ele não é desta comunidade."
          />
        </View>
      </Screen>
    );
  }
  const g = guia.data;
  const fotos = g.photos;
  const destaque = fotos[foto] ?? fotos[0];

  // Sem player embutido (Expo Go): o vídeo abre no navegador do sistema, com a
  // URL assinada renovada se o guia foi buscado há tempo demais.
  async function assistir() {
    setAbrindo(true);
    try {
      let atual = guia.data;
      if (Date.now() - guia.dataUpdatedAt > SIGNED_VIDEO_REFRESH_MS) {
        atual = (await guia.refetch()).data;
      }
      const url = atual?.video?.url;
      if (url) await WebBrowser.openBrowserAsync(url);
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <>
      <Screen
        onRefresh={() => void guia.refetch()}
        refreshing={guia.isRefetching}
        footer={
          <View className="flex-1 flex-row gap-2">
            <Button
              variant="outline"
              accessibilityLabel="Como fazer"
              className="flex-1 flex-row gap-2"
              onPress={() => openHowTo(exerciseId)}
            >
              <BookOpen size={18} color={colors.foreground} />
              <Text className="font-sans-semibold text-sm text-foreground">Como fazer</Text>
            </Button>
            <Button
              accessibilityLabel="Pôr num treino"
              className="flex-1 flex-row gap-2"
              onPress={() => setEscolhendo(true)}
            >
              <Plus size={18} color={colors.primaryForeground} />
              <Text className="font-sans-semibold text-sm text-primary-foreground">
                Pôr num treino
              </Text>
            </Button>
          </View>
        }
      >
        <View className="gap-3 px-5 pb-6 pt-4">
          {g.video?.url ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Vídeo: ${g.name}`}
              accessibilityHint="Abre o vídeo no navegador"
              onPress={() => void assistir()}
              disabled={abrindo}
              className="aspect-video w-full overflow-hidden rounded-3xl bg-surface-3"
            >
              {destaque?.url ? (
                <Image
                  source={{ uri: destaque.url }}
                  accessibilityIgnoresInvertColors
                  resizeMode="cover"
                  style={{ width: '100%', height: '100%' }}
                />
              ) : null}
              <View className="absolute inset-0 items-center justify-center bg-black/25">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-background/90">
                  {abrindo ? (
                    <ActivityIndicator color={colors.foreground} />
                  ) : (
                    <Play size={24} color={colors.foreground} fill={colors.foreground} />
                  )}
                </View>
              </View>
            </Pressable>
          ) : destaque?.url ? (
            <Image
              source={{ uri: destaque.url }}
              accessibilityLabel={`Foto de ${g.name}`}
              className="aspect-video w-full rounded-3xl"
            />
          ) : null}
          {fotos.length > 1 ? (
            <View className="flex-row gap-2">
              {fotos.map((f, i) => (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Foto ${i + 1} de ${fotos.length}`}
                  accessibilityState={{ selected: i === foto }}
                  onPress={() => setFoto(i)}
                  className={cn(
                    'h-16 w-16 overflow-hidden rounded-xl',
                    i === foto && 'border-2 border-primary',
                  )}
                >
                  {f.url ? (
                    <Image
                      source={{ uri: f.url }}
                      accessibilityIgnoresInvertColors
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View className="gap-0.5">
            <Text accessibilityRole="header" className="font-display text-2xl text-foreground">
              {g.name}
            </Text>
            <View className="flex-row flex-wrap gap-1.5 pt-1.5">
              {[g.muscleGroup, g.equipment].filter(Boolean).map((c) => (
                <View key={c} className="rounded-full bg-surface-3 px-2.5 py-0.5">
                  <Text className="text-xs font-sans-bold uppercase tracking-wide text-muted-foreground">
                    {c}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {g.tips ? (
            <View className="gap-1.5 rounded-2xl bg-card p-4">
              <View className="flex-row items-center gap-2">
                <View className="h-7 w-7 items-center justify-center rounded-full bg-surface-3">
                  <Text className="text-[11px] font-sans-bold text-foreground">
                    {initialsOf(g.authorName)}
                  </Text>
                </View>
                <Text
                  accessibilityRole="header"
                  className="text-sm font-sans-semibold text-foreground"
                >
                  {`Dica de ${g.authorName}`}
                </Text>
              </View>
              <Text className="text-sm leading-relaxed text-muted-foreground">{g.tips}</Text>
            </View>
          ) : null}
        </View>
      </Screen>
      <DrawerLayer>
        <PlanPickerDrawer
          open={escolhendo}
          onOpenChange={setEscolhendo}
          exerciseId={exerciseId}
          exerciseName={g.name}
        />
      </DrawerLayer>
    </>
  );
}

/**
 * O guia da academia (Cm-16, #396), equivalente de
 * `apps/web/src/app/(app)/community/[groupId]/content/exercises/[exerciseId]/page.tsx`:
 * vídeo e fotos da academia, a dica de quem escreveu, o "Como fazer" do Fatia
 * e o "Pôr num treino", que escolhe um dos meus planos.
 */
export default function CommunityGuideScreen() {
  const { groupId, exerciseId } = useLocalSearchParams<{ groupId: string; exerciseId: string }>();
  return (
    <>
      <GuideBody groupId={groupId} exerciseId={Number(exerciseId)} />
    </>
  );
}

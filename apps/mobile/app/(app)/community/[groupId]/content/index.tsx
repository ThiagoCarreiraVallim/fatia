import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, PlayCircle } from 'lucide-react-native';
import { groupContentApi, groupExerciseApi, groupsApi, sortTips } from '@fatia/api-client';
import { TemplateCard, TipCard } from '@/components/content/content-cards';
import { Screen } from '@/components/layout/screen';
import { Choice } from '@/components/org/org-panel';
import { EmptyState, LoadingState } from '@/components/ui';
import {
  ExerciseDetailHost,
  useOpenExerciseDetail,
} from '@/components/workout/exercise-detail-host';
import { cores } from '@/theme/cores';

type Aba = 'plans' | 'tips' | 'exercises';
const ABAS: Aba[] = ['plans', 'tips', 'exercises'];

/** O catálogo da comunidade (Fase 7b); tocar abre o detalhe com o tutorial dela. */
function Exercicios({ groupId }: { groupId: string }) {
  const abrir = useOpenExerciseDetail();
  const lista = useQuery({
    queryKey: ['community', 'exercises', groupId],
    queryFn: () => groupExerciseApi.forMember(groupId),
  });
  if (lista.isPending) return <LoadingState label="Carregando os exercícios…" />;
  if (!lista.data?.length) {
    return (
      <EmptyState
        title="Nenhum exercício ainda"
        description="Os exercícios e tutoriais que a equipe gravar aparecem aqui e no seu treino."
      />
    );
  }
  return (
    <>
      {lista.data.map((e) => (
        <Pressable
          key={e.exerciseId}
          accessibilityRole="button"
          accessibilityLabel={`${e.name}${e.video ? ', com vídeo' : ''}`}
          onPress={() => abrir(e.exerciseId)}
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
        >
          {e.photos[0]?.url ? (
            <Image
              source={{ uri: e.photos[0].url }}
              accessibilityIgnoresInvertColors
              className="h-14 w-14 rounded-xl"
            />
          ) : (
            <View className="h-14 w-14 items-center justify-center rounded-xl bg-muted">
              <Dumbbell size={20} color={cores.mutedForeground} />
            </View>
          )}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
              {e.name}
            </Text>
            <Text className="text-xs capitalize text-muted-foreground">
              {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {e.video ? <PlayCircle size={20} color={cores.primary} /> : null}
        </Pressable>
      ))}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/content/page.tsx`. */
export default function CommunityContentScreen() {
  const { groupId, tab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(ABAS.find((a) => a === tab) ?? 'plans');
  const grupo = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const planos = useQuery({
    queryKey: ['community', 'plans', groupId],
    queryFn: () => groupContentApi.plans(groupId),
  });
  const dicas = useQuery({
    queryKey: ['community', 'tips', groupId],
    queryFn: () => groupContentApi.tips(groupId),
  });

  return (
    <ExerciseDetailHost>
      <Screen
        title={grupo.data ? `Planos e dicas · ${grupo.data.name}` : 'Planos e dicas'}
        onRefresh={() => void Promise.all([planos.refetch(), dicas.refetch()])}
        refreshing={planos.isRefetching || dicas.isRefetching}
      >
        <View className="gap-4 px-5 pb-4 pt-4">
          <Choice
            label=""
            options={[
              { value: 'plans', label: 'Planos' },
              { value: 'tips', label: 'Dicas' },
              { value: 'exercises', label: 'Exercícios' },
            ]}
            value={aba}
            onChange={setAba}
          />
          {aba === 'exercises' ? (
            <Exercicios groupId={groupId} />
          ) : aba === 'plans' ? (
            planos.isPending ? (
              <LoadingState label="Carregando os planos…" />
            ) : planos.data?.length ? (
              planos.data.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPress={() => router.push(`/community/${groupId}/content/${t.id}`)}
                />
              ))
            ) : (
              <EmptyState
                title="Nenhum plano publicado"
                description="Quando a equipe publicar um plano, ele aparece aqui para você adotar."
              />
            )
          ) : dicas.isPending ? (
            <LoadingState label="Carregando as dicas…" />
          ) : dicas.data?.length ? (
            sortTips(dicas.data).map((d) => <TipCard key={d.id} tip={d} />)
          ) : (
            <EmptyState
              title="Nenhuma dica publicada"
              description="As dicas da equipe aparecem aqui."
            />
          )}
        </View>
      </Screen>
    </ExerciseDetailHost>
  );
}

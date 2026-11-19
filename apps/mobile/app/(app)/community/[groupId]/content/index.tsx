import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react-native';
import { groupContentApi, groupExerciseApi, groupsApi, sortTips } from '@fatia/api-client';
import {
  GuideRow,
  GymEquipmentCard,
  MemberTemplateRow,
  MemberTipCard,
} from '@/components/content/member-content';
import { CommunityTabs } from '@/components/community/community-tabs';
import { Screen } from '@/components/layout/screen';
import { TOP_BAR_ACTION } from '@/components/layout/top-bar';
import { EmptyState, ErrorState, LoadingState, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { colors } from '@/theme/colors';

type Aba = 'plans' | 'tips' | 'exercises';
const ABAS: Aba[] = ['plans', 'tips', 'exercises'];

/** Os guias de exercício da academia e, embaixo, o equipamento que ela tem. */
function CommunityGuides({ groupId }: { groupId: string }) {
  const router = useRouter();
  const lista = useQuery({
    queryKey: ['community', 'exercises', groupId],
    queryFn: () => groupExerciseApi.forMember(groupId),
  });
  const equipamento = useQuery({
    queryKey: ['community', 'exercises', groupId, 'equipment'],
    queryFn: () => groupExerciseApi.memberEquipment(groupId),
  });
  return (
    <>
      {lista.isPending ? (
        <LoadingState label="Carregando os exercícios…" />
      ) : lista.isError ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : lista.data.length ? (
        lista.data.map((e) => (
          <GuideRow
            key={e.exerciseId}
            guide={e}
            onPress={() => router.push(`/community/${groupId}/content/exercises/${e.exerciseId}`)}
          />
        ))
      ) : (
        <EmptyState
          title="Nenhum exercício ainda"
          description="Os guias que a equipe gravar aparecem aqui e no seu treino."
        />
      )}
      {equipamento.data ? <GymEquipmentCard state={equipamento.data} /> : null}
    </>
  );
}

/**
 * A aba Conteúdo da comunidade (Cm-12, #396), equivalente de
 * `apps/web/src/app/(app)/community/[groupId]/content/page.tsx`: os planos, as
 * dicas e os guias que a equipe publicou. Cada item abre a própria tela.
 */
export default function CommunityContentScreen() {
  const { groupId, tab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const [aba, setAba] = useState<Aba>(ABAS.find((a) => a === tab) ?? 'plans');
  // O "?tab=tips" do atalho da dica fixada também vale com a tela já aberta
  // atrás na pilha (ajuste durante o render, e não num efeito — #187).
  const [tabParam, setTabParam] = useState(tab);
  if (tabParam !== tab) {
    setTabParam(tab);
    const nova = ABAS.find((a) => a === tab);
    if (nova) setAba(nova);
  }
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
    <Screen
      title={grupo.data?.name ?? 'Conteúdo'}
      onRefresh={() => void Promise.all([planos.refetch(), dicas.refetch()])}
      refreshing={planos.isRefetching || dicas.isRefetching}
      actions={
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Sobre a comunidade"
          onPress={() => router.push(`/community/${groupId}/settings`)}
          className={TOP_BAR_ACTION}
        >
          <Info size={20} color={colors.mutedForeground} />
        </Pressable>
      }
    >
      <View className="gap-4 px-5 pb-4 pt-4">
        <CommunityTabs groupId={groupId} />
        {/* Abas segmentadas, e não pílulas de `Choice`: as pílulas logo abaixo
            das abas da comunidade pareciam filtro ou escolha de formulário. */}
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="plans">Planos</TabsTrigger>
            <TabsTrigger value="tips">Dicas</TabsTrigger>
            <TabsTrigger value="exercises">Exercícios</TabsTrigger>
          </TabsList>
        </Tabs>
        <View className="gap-2">
          {aba === 'exercises' ? (
            <CommunityGuides groupId={groupId} />
          ) : aba === 'plans' ? (
            planos.isPending ? (
              <LoadingState label="Carregando os planos…" />
            ) : planos.isError ? (
              <ErrorState error={planos.error} onRetry={() => void planos.refetch()} />
            ) : planos.data.length ? (
              planos.data.map((t) => (
                <MemberTemplateRow
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
          ) : dicas.isError ? (
            <ErrorState error={dicas.error} onRetry={() => void dicas.refetch()} />
          ) : dicas.data.length ? (
            sortTips(dicas.data).map((d) => (
              <MemberTipCard
                key={d.id}
                tip={d}
                onPress={() => router.push(`/community/${groupId}/content/tips/${d.id}`)}
              />
            ))
          ) : (
            <EmptyState
              title="Nenhuma dica publicada"
              description="As dicas da equipe aparecem aqui."
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

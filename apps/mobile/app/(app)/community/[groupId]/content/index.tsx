import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { groupContentApi, groupsApi, sortTips } from '@fatia/api-client';
import { TemplateCard, TipCard } from '@/components/content/content-cards';
import { Screen } from '@/components/layout/screen';
import { Choice } from '@/components/org/org-panel';
import { EmptyState, LoadingState } from '@/components/ui';

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/content/page.tsx`. */
export default function CommunityContentScreen() {
  const { groupId, tab } = useLocalSearchParams<{ groupId: string; tab?: string }>();
  const router = useRouter();
  const [aba, setAba] = useState<'plans' | 'tips'>(tab === 'tips' ? 'tips' : 'plans');
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
          ]}
          value={aba}
          onChange={setAba}
        />
        {aba === 'plans' ? (
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
  );
}

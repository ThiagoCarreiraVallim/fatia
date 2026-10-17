'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Lightbulb } from 'lucide-react';
import { groupContentApi, groupsApi, sortTips } from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { TemplateCard, TipCard } from '@/components/content/content-cards';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Os planos prontos e as dicas que a equipe da comunidade publicou. */
export default function CommunityContentPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const aba = useSearchParams().get('tab') === 'tips' ? 'tips' : 'plans';
  const grupo = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const planos = useQuery({
    queryKey: communityKeys.plans(groupId),
    queryFn: () => groupContentApi.plans(groupId),
  });
  const dicas = useQuery({
    queryKey: communityKeys.tips(groupId),
    queryFn: () => groupContentApi.tips(groupId),
  });
  useTopBarTitle(grupo.data ? `Planos e dicas · ${grupo.data.name}` : 'Planos e dicas');

  return (
    <div className="space-y-4 p-4">
      <Tabs defaultValue={aba}>
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="tips">Dicas</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="space-y-2 pt-2">
          {planos.isPending ? (
            <Skeleton className="h-24 rounded-2xl bg-card" />
          ) : planos.data?.length ? (
            <ul className="space-y-2" aria-label="Planos prontos">
              {planos.data.map((t) => (
                <li key={t.id}>
                  <TemplateCard template={t} href={`/community/${groupId}/content/${t.id}`} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Dumbbell}
              title="Nenhum plano publicado"
              description="Quando a equipe publicar um plano, ele aparece aqui para você adotar."
            />
          )}
        </TabsContent>
        <TabsContent value="tips" className="space-y-3 pt-2">
          {dicas.isPending ? (
            <Skeleton className="h-24 rounded-2xl bg-card" />
          ) : dicas.data?.length ? (
            sortTips(dicas.data).map((d) => <TipCard key={d.id} tip={d} />)
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhuma dica publicada"
              description="As dicas da equipe aparecem aqui."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Info, Lightbulb, Video } from 'lucide-react';
import {
  groupContentApi,
  groupExerciseApi,
  groupsApi,
  sortTips,
  visibleCommunityPlans,
  visibleCommunityTips,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { ListError } from '@/components/content/content-ui';
import {
  GuideRow,
  GymEquipmentCard,
  MemberTemplateRow,
  MemberTipCard,
} from '@/components/content/member-content';
import { TopBarActions, topBarActionClass, useTopBarTitle } from '@/components/layout/app-top-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['plans', 'tips', 'exercises'] as const;
type Tab = (typeof TABS)[number];

/**
 * A aba Conteúdo da comunidade (Cm-12, #396): os planos, as dicas e os guias de
 * exercício que a equipe publicou. Cada item abre a própria tela (plano, dica,
 * guia da academia); a API só devolve o que está publicado.
 */
export default function CommunityContentPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(TABS.find((a) => a === requested) ?? 'plans');
  // O "?tab=tips" do atalho da dica fixada também vale com a página já aberta
  // (o Next não remonta ao trocar só a busca): ajuste durante o render, como no app.
  const [lastRequested, setLastRequested] = useState(requested);
  if (lastRequested !== requested) {
    setLastRequested(requested);
    const next = TABS.find((a) => a === requested);
    if (next) setTab(next);
  }
  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const plans = useQuery({
    queryKey: communityKeys.plans(groupId),
    queryFn: () => groupContentApi.plans(groupId),
  });
  const tips = useQuery({
    queryKey: communityKeys.tips(groupId),
    queryFn: () => groupContentApi.tips(groupId),
  });
  useTopBarTitle(group.data?.name ?? 'Conteúdo');
  // Seções escondidas pela comunidade (#413): só some daqui. O plano que a
  // pessoa já adotou e o que ela registrou continuam no app dela.
  const hidden = group.data?.hiddenSections;
  const planList = plans.data ? visibleCommunityPlans(plans.data, hidden) : undefined;
  const tipList = tips.data ? visibleCommunityTips(tips.data, hidden) : undefined;

  return (
    <div className="space-y-4 p-4">
      <TopBarActions>
        <Link
          href={`/community/${groupId}/settings`}
          aria-label="Sobre a comunidade"
          className={topBarActionClass}
        >
          <Info size={20} aria-hidden />
        </Link>
      </TopBarActions>
      <CommunityTabs groupId={groupId} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="tips">Dicas</TabsTrigger>
          <TabsTrigger value="exercises">Exercícios</TabsTrigger>
        </TabsList>
        <TabsContent value="plans" className="space-y-2 pt-2">
          {plans.isPending ? (
            <Skeleton className="h-24 rounded-2xl bg-card" />
          ) : plans.isError ? (
            <ListError
              title="Não deu para carregar os planos"
              onRetry={() => void plans.refetch()}
            />
          ) : planList?.length ? (
            <ul className="space-y-2" aria-label="Planos da equipe">
              {planList.map((t) => (
                <li key={t.id}>
                  <MemberTemplateRow template={t} href={`/community/${groupId}/content/${t.id}`} />
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
        <TabsContent value="tips" className="space-y-2 pt-2">
          {tips.isPending ? (
            <Skeleton className="h-24 rounded-2xl bg-card" />
          ) : tips.isError ? (
            <ListError title="Não deu para carregar as dicas" onRetry={() => void tips.refetch()} />
          ) : tipList?.length ? (
            <ul className="space-y-2" aria-label="Dicas da equipe">
              {sortTips(tipList).map((d) => (
                <li key={d.id}>
                  <MemberTipCard tip={d} href={`/community/${groupId}/content/tips/${d.id}`} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhuma dica publicada"
              description="As dicas da equipe aparecem aqui."
            />
          )}
        </TabsContent>
        <TabsContent value="exercises" className="space-y-2 pt-2">
          <CommunityGuides groupId={groupId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Os guias de exercício da academia e, embaixo, o equipamento que ela tem. */
function CommunityGuides({ groupId }: { groupId: string }) {
  const list = useQuery({
    queryKey: communityKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.forMember(groupId),
  });
  const equipment = useQuery({
    queryKey: [...communityKeys.exercises(groupId), 'equipment'],
    queryFn: () => groupExerciseApi.memberEquipment(groupId),
  });

  return (
    <>
      {list.isPending ? (
        <Skeleton className="h-24 rounded-2xl bg-card" />
      ) : list.isError ? (
        <ListError
          title="Não deu para carregar os exercícios"
          onRetry={() => void list.refetch()}
        />
      ) : list.data.length ? (
        <ul className="space-y-2" aria-label="Guias da academia">
          {list.data.map((e) => (
            <li key={e.exerciseId}>
              <GuideRow
                guide={e}
                href={`/community/${groupId}/content/exercises/${e.exerciseId}`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Video}
          title="Nenhum exercício ainda"
          description="Os guias que a equipe gravar aparecem aqui e no seu treino."
        />
      )}
      {equipment.data && <GymEquipmentCard state={equipment.data} />}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Lightbulb, PlayCircle, Video } from 'lucide-react';
import {
  groupContentApi,
  groupExerciseApi,
  groupsApi,
  sortTips,
  workoutApi,
} from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { TemplateCard, TipCard } from '@/components/content/content-cards';
import { ListError, RowChevron } from '@/components/content/content-ui';
import { ExerciseDetailDrawer } from '@/components/workout/exercise-detail-drawer';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TABS = ['plans', 'tips', 'exercises'] as const;
type Tab = (typeof TABS)[number];

/** Os planos prontos, as dicas e os exercícios que a equipe da comunidade publicou. */
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
  useTopBarTitle(group.data ? `Planos e dicas · ${group.data.name}` : 'Planos e dicas');

  return (
    <div className="space-y-4 p-4">
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
            // Antes o erro caía no "Nenhum plano publicado".
            <ListError
              title="Não deu para carregar os planos"
              onRetry={() => void plans.refetch()}
            />
          ) : plans.data.length ? (
            <ul className="space-y-2" aria-label="Planos prontos">
              {plans.data.map((t) => (
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
          {tips.isPending ? (
            <Skeleton className="h-24 rounded-2xl bg-card" />
          ) : tips.isError ? (
            <ListError title="Não deu para carregar as dicas" onRetry={() => void tips.refetch()} />
          ) : tips.data.length ? (
            sortTips(tips.data).map((d) => <TipCard key={d.id} tip={d} />)
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhuma dica publicada"
              description="As dicas da equipe aparecem aqui."
            />
          )}
        </TabsContent>
        <TabsContent value="exercises" className="space-y-2 pt-2">
          <CommunityExercises groupId={groupId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * O catálogo da comunidade (Fase 7b): os exercícios da casa e os tutoriais
 * gravados pela equipe. Abrir mostra o detalhe de sempre, com o vídeo dela.
 */
function CommunityExercises({ groupId }: { groupId: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useQuery({
    queryKey: communityKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.forMember(groupId),
  });
  const detail = useQuery({
    queryKey: ['workout', 'exercise', openId],
    queryFn: () => workoutApi.getExercise(openId!),
    enabled: openId !== null,
  });

  if (list.isPending) return <Skeleton className="h-24 rounded-2xl bg-card" />;
  if (list.isError) {
    return (
      <ListError title="Não deu para carregar os exercícios" onRetry={() => void list.refetch()} />
    );
  }
  if (!list.data.length) {
    return (
      <EmptyState
        icon={Video}
        title="Nenhum exercício ainda"
        description="Os exercícios e tutoriais que a equipe gravar aparecem aqui e no seu treino."
      />
    );
  }
  return (
    <>
      <ul className="space-y-2" aria-label="Exercícios da comunidade">
        {list.data.map((e) => (
          <li key={e.exerciseId}>
            <button
              type="button"
              onClick={() => setOpenId(e.exerciseId)}
              className="flex w-full items-center gap-3 rounded-2xl border border-subtle bg-card p-3 text-left hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {e.photos[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador
                <img
                  src={e.photos[0].url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Dumbbell className="h-5 w-5 text-muted-foreground" aria-hidden />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{e.name}</span>
                <span className="block text-xs capitalize text-muted-foreground">
                  {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')}
                </span>
              </span>
              {e.video && (
                <PlayCircle className="h-5 w-5 shrink-0 text-primary" aria-label="Com vídeo" />
              )}
              {/* Sem a seta, a linha parecia só informação. */}
              <RowChevron />
            </button>
          </li>
        ))}
      </ul>
      <ExerciseDetailDrawer
        exercise={detail.data ?? null}
        open={openId !== null && Boolean(detail.data)}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      />
    </>
  );
}

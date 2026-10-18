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
import { communityKeys } from '@/components/community/query-keys';
import { TemplateCard, TipCard } from '@/components/content/content-cards';
import { ExerciseDetailDrawer } from '@/components/workout/exercise-detail-drawer';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ABAS = ['plans', 'tips', 'exercises'] as const;

/** Os planos prontos, as dicas e os exercícios que a equipe da comunidade publicou. */
export default function CommunityContentPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const pedida = useSearchParams().get('tab');
  const aba = ABAS.find((a) => a === pedida) ?? 'plans';
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
          <TabsTrigger value="exercises">Exercícios</TabsTrigger>
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
  const [aberto, setAberto] = useState<number | null>(null);
  const lista = useQuery({
    queryKey: communityKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.forMember(groupId),
  });
  const detalhe = useQuery({
    queryKey: ['workout', 'exercise', aberto],
    queryFn: () => workoutApi.getExercise(aberto!),
    enabled: aberto !== null,
  });

  if (lista.isPending) return <Skeleton className="h-24 rounded-2xl bg-card" />;
  if (!lista.data?.length) {
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
        {lista.data.map((e) => (
          <li key={e.exerciseId}>
            <button
              type="button"
              onClick={() => setAberto(e.exerciseId)}
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
            </button>
          </li>
        ))}
      </ul>
      <ExerciseDetailDrawer
        exercise={detalhe.data ?? null}
        open={aberto !== null && Boolean(detalhe.data)}
        onOpenChange={(o) => {
          if (!o) setAberto(null);
        }}
      />
    </>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { challengesApi } from '@fatia/api-client';
import { ChallengeCard } from '@/components/challenges/challenge-ui';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/** Os desafios da comunidade, para o membro (Fase 8a): em andamento, marcados e encerrados. */
export default function CommunityChallengesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const lista = useQuery({
    queryKey: communityKeys.challenges(groupId),
    queryFn: () => challengesApi.list(groupId),
  });

  if (lista.isPending) return <Skeleton className="m-4 h-40 rounded-2xl bg-card" />;
  if (lista.isError) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Trophy}
          title="Não deu para abrir os desafios"
          description="Tente de novo em alguns instantes."
          action={
            <Button variant="outline" onClick={() => void lista.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }
  const todos = lista.data.challenges;
  const abertos = todos.filter((c) => c.status !== 'ended');
  const encerrados = todos.filter((c) => c.status === 'ended');

  return (
    <div className="space-y-6 p-4">
      <CommunityTabs groupId={groupId} />
      <p className="text-sm text-muted-foreground">
        Participar é opcional. O ranking de cada desafio aparece só para quem entrou, com o apelido
        que a pessoa escolheu.
      </p>
      {todos.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="Nenhum desafio ainda"
          description="Quando a equipe marcar um desafio, ele aparece aqui."
        />
      )}
      {abertos.length > 0 && (
        <section className="space-y-2" aria-labelledby="abertos">
          <h2 id="abertos" className="text-sm font-semibold">
            Em andamento e marcados
          </h2>
          <ul className="space-y-2">
            {abertos.map((c) => (
              <li key={c.id}>
                <ChallengeCard challenge={c} href={`/community/${groupId}/challenges/${c.id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {encerrados.length > 0 && (
        <section className="space-y-2" aria-labelledby="encerrados">
          <h2 id="encerrados" className="text-sm font-semibold">
            Encerrados
          </h2>
          <ul className="space-y-2">
            {encerrados.map((c) => (
              <li key={c.id}>
                <ChallengeCard challenge={c} href={`/community/${groupId}/challenges/${c.id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

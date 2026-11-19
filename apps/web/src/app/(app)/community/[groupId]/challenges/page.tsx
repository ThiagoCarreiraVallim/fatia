'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import {
  challengeSections,
  challengesApi,
  type Challenge,
  type ChallengeList,
} from '@fatia/api-client';
import { apiErrorMessage, ChallengeCard } from '@/components/challenges/challenge-ui';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

function Section({
  id,
  title,
  items,
  render,
}: {
  id: string;
  title: string;
  items: Challenge[];
  render: (c: Challenge) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2.5" aria-labelledby={id}>
      <h2 id={id} className="px-1 text-eb uppercase text-muted-foreground">
        {title}
      </h2>
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id}>{render(c)}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Os desafios da comunidade para o membro (Cm-08): os que a pessoa participa,
 * os em andamento para olhar, os marcados (com "Me avise") e os encerrados.
 */
export default function CommunityChallengesPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: communityKeys.challenges(groupId),
    queryFn: () => challengesApi.list(groupId),
  });

  const watch = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => challengesApi.watch(groupId, id, on),
    onSuccess: ({ watching }, { id }) => {
      qc.setQueryData<ChallengeList>(communityKeys.challenges(groupId), (old) =>
        old
          ? {
              ...old,
              challenges: old.challenges.map((c) => (c.id === id ? { ...c, watching } : c)),
            }
          : old,
      );
      toast(watching ? 'Vamos avisar quando começar.' : 'Aviso desligado.');
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar o aviso agora.')),
  });

  if (list.isPending) return <Skeleton className="m-4 h-40 rounded-card bg-card" />;
  if (list.isError) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Trophy}
          title="Não deu para abrir os desafios"
          description="Tente de novo em alguns instantes."
          action={
            <Button variant="outline" onClick={() => void list.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }
  const all = list.data.challenges;
  const s = challengeSections(all);
  const href = (c: Challenge) => `/community/${groupId}/challenges/${c.id}`;
  const card = (c: Challenge) => (
    <ChallengeCard
      challenge={c}
      href={href(c)}
      onWatch={(on) => watch.mutate({ id: c.id, on })}
      watchPending={watch.isPending && watch.variables?.id === c.id}
    />
  );

  return (
    <div className="space-y-5 p-4">
      <CommunityTabs groupId={groupId} />
      <p className="px-1 text-xs text-muted-foreground">
        Participar é opcional. Desafios contam constância: treino com foto, água, passos, proteína
        ou pontos somando tudo. Peso e medidas nunca contam.
      </p>
      {all.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="Nenhum desafio ainda"
          description="Quando a equipe marcar um desafio, ele aparece aqui."
        />
      )}
      <Section id="desafios-meus" title="Você participa" items={s.mine} render={card} />
      <Section id="desafios-olhar" title="Para olhar" items={s.browse} render={card} />
      <Section id="desafios-proximos" title="Próximo" items={s.upcoming} render={card} />
      <Section id="desafios-encerrados" title="Encerrados" items={s.ended} render={card} />
    </div>
  );
}

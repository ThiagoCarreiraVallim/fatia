'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { challengesApi } from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { ChallengeCard } from './challenge-ui';

/**
 * "Desafios" no detalhe da comunidade: os que estão em andamento ou marcados,
 * com o atalho para ver todos. Some quando não há nenhum aberto.
 */
export function CommunityChallengesPreview({ groupId }: { groupId: string }) {
  const lista = useQuery({
    queryKey: communityKeys.challenges(groupId),
    queryFn: () => challengesApi.list(groupId),
  });
  const abertos = (lista.data?.challenges ?? []).filter((c) => c.status !== 'ended').slice(0, 2);
  if (abertos.length === 0) return null;
  const todos = `/community/${groupId}/challenges`;

  return (
    <section className="space-y-2" aria-labelledby="desafios">
      <div className="flex items-center justify-between">
        <h2 id="desafios" className="text-sm font-semibold">
          Desafios
        </h2>
        <Link href={todos} className="text-xs font-semibold text-primary">
          Ver todos
        </Link>
      </div>
      <ul className="space-y-2" aria-label="Desafios abertos">
        {abertos.map((c) => (
          <li key={c.id}>
            <ChallengeCard challenge={c} href={`${todos}/${c.id}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

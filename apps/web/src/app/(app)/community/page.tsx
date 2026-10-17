'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, KeyRound, Plus, Users } from 'lucide-react';
import { groupsApi, membershipBadge, teamRoleLabel } from '@fatia/api-client';
import { PlanBadge } from '@/components/billing/plan-badge';
import { JoinByCodeDrawer } from '@/components/community/join-by-code-drawer';
import { communityKeys } from '@/components/community/query-keys';
import { TopBarActions, topBarActionClass } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/** Minhas comunidades: onde estou, com que papel, e se a comunidade paga meu PRO. */
export default function CommunityPage() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const groups = useQuery({ queryKey: communityKeys.mine, queryFn: () => groupsApi.mine() });

  return (
    <div className="space-y-5 p-4">
      <TopBarActions>
        <button
          type="button"
          className={topBarActionClass}
          aria-label="Entrar com código"
          onClick={() => setJoining(true)}
        >
          <KeyRound size={20} aria-hidden />
        </button>
        <Link href="/community/new" className={topBarActionClass} aria-label="Criar comunidade">
          <Plus size={20} aria-hidden />
        </Link>
      </TopBarActions>

      {groups.isPending && (
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-[72px] rounded-2xl bg-card" />
          <Skeleton className="h-[72px] rounded-2xl bg-card" />
        </div>
      )}
      {groups.isError && (
        <p role="alert" className="text-sm text-danger">
          Não deu para carregar suas comunidades.{' '}
          <button type="button" className="underline" onClick={() => groups.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {groups.data && groups.data.length === 0 && (
        <EmptyState
          icon={Users}
          title="Suas comunidades aparecem aqui"
          description="Entre pelo convite da sua academia ou do seu treinador, ou pelo código que eles divulgam, e escolha o que compartilhar. Se você atende ou tem uma academia, crie a sua."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setJoining(true)}>Entrar com código</Button>
              <Button asChild variant="outline">
                <Link href="/community/new">Criar comunidade</Link>
              </Button>
            </div>
          }
        />
      )}
      {groups.data && groups.data.length > 0 && (
        <ul
          aria-label="Minhas comunidades"
          className="divide-y rounded-2xl border border-subtle bg-card"
        >
          {groups.data.map((g) => {
            const selo = membershipBadge(g.status);
            return (
              <li key={g.id}>
                <Link
                  href={`/community/${g.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {selo ? `${teamRoleLabel(g.role)} · ${selo}` : teamRoleLabel(g.role)}
                    </span>
                  </span>
                  {g.hasAiSeat && <PlanBadge tier="PRO" />}
                  <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <JoinByCodeDrawer
        open={joining}
        onOpenChange={setJoining}
        onJoined={(groupId) => router.push(`/community/${groupId}`)}
      />
    </div>
  );
}

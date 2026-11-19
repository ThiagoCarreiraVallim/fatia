'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox } from 'lucide-react';
import { forYouApi, groupsApi, relativeTime, type ForYouItem } from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { communityKeys } from '@/components/community/query-keys';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const KIND_LABEL: Record<ForYouItem['kind'], string> = {
  PLAN_OFFER: 'Plano de treino',
  NUTRITION_PLAN: 'Plano alimentar',
};

function Secao({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-primary/15 px-2 text-xs text-primary">{count}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function ItemCard({ item, done }: { item: ForYouItem; done?: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-start gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent/30"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">
            {KIND_LABEL[item.kind]}
          </span>
          <span className="block font-semibold">{item.title}</span>
          {item.note && !done && (
            <span className="block text-sm text-muted-foreground">{item.note}</span>
          )}
          <span className="block text-xs text-muted-foreground">
            {[item.from, relativeTime(item.at)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronRight size={18} className="mt-1 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * A aba Para você (#394, prancha Cm-20): o que a equipe mandou só para a
 * pessoa nesta comunidade, os comunicados, o conteúdo novo e o que já foi
 * resolvido. Cada item leva à tela que já resolve (aceitar o plano, ver o que
 * mudou). Avaliação pedida (#383) e questionário (#391) entram com as issues
 * deles.
 */
export default function CommunityForYouPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: communityKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  useTopBarTitle(group.data?.name);
  const data = useQuery({
    queryKey: communityKeys.forYou(groupId),
    queryFn: () => forYouApi.get(groupId),
  });

  if (data.isPending) return <Skeleton className="m-4 h-40 rounded-2xl bg-card" />;
  if (data.isError) {
    return (
      <div className="p-4">
        <EmptyState
          icon={Inbox}
          title="Não deu para abrir o Para você"
          action={
            <Button variant="outline" onClick={() => void data.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }
  const v = data.data;
  const vazio = v.todo.length + v.recommended.length + v.fromTeam.length + v.done.length === 0;

  return (
    <div className="space-y-6 p-4">
      <CommunityTabs groupId={groupId} />
      <p className="text-sm text-muted-foreground">
        {group.data
          ? `O que a equipe da ${group.data.name} mandou só para você.`
          : 'O que a equipe mandou só para você.'}
      </p>

      {vazio && (
        <EmptyState
          icon={Inbox}
          title="Nada para você agora"
          description="Quando a equipe mandar um plano ou um comunicado, aparece aqui."
        />
      )}

      {v.todo.length > 0 && (
        <Secao id="para-fazer" title="Para fazer" count={v.todo.length}>
          <ul className="space-y-2">
            {v.todo.map((i) => (
              <ItemCard key={`${i.kind}-${i.id}`} item={i} />
            ))}
          </ul>
        </Secao>
      )}

      {v.recommended.length > 0 && (
        <Secao id="recomendado" title="Recomendado para você">
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4">
            {v.recommended.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="w-56 shrink-0">
                <Link
                  href={r.href}
                  className="block h-full space-y-1 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent/30"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">
                    {r.meta}
                  </span>
                  <span className="block font-semibold">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {v.fromTeam.length > 0 && (
        <Secao id="da-equipe" title="Da equipe">
          <ul className="space-y-2">
            {v.fromTeam.map((n) => (
              <li key={n.postId}>
                <Link
                  href={`/community/${groupId}#post-${n.postId}`}
                  className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-4 hover:bg-accent/30"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{`Comunicado: ${n.title}`}</span>
                    <span className="block text-xs text-muted-foreground">
                      {n.from} · {n.unread ? 'não lido' : relativeTime(n.at)}
                    </span>
                  </span>
                  {n.unread && (
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {v.done.length > 0 && (
        <Secao id="resolvido" title="Já resolvido">
          <ul className="space-y-2 opacity-80">
            {v.done.map((i) => (
              <ItemCard key={`${i.kind}-${i.id}`} item={i} done />
            ))}
          </ul>
        </Secao>
      )}
    </div>
  );
}

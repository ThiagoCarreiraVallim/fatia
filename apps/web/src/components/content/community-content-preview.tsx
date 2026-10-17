'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pin } from 'lucide-react';
import { groupContentApi, markdownLitePlainText } from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { TemplateCard } from './content-cards';

/**
 * "Planos e dicas" no detalhe da comunidade: a dica fixada e os planos mais
 * novos, com o atalho para ver tudo. Some quando a comunidade não publicou nada.
 */
export function CommunityContentPreview({ groupId }: { groupId: string }) {
  const planos = useQuery({
    queryKey: communityKeys.plans(groupId),
    queryFn: () => groupContentApi.plans(groupId),
  });
  const dicas = useQuery({
    queryKey: communityKeys.tips(groupId),
    queryFn: () => groupContentApi.tips(groupId),
  });
  const fixada = dicas.data?.find((d) => d.pinned);
  const recentes = (planos.data ?? []).slice(0, 3);
  if (!fixada && recentes.length === 0 && !(dicas.data?.length ?? 0)) return null;
  const todos = `/community/${groupId}/content`;

  return (
    <section className="space-y-2" aria-labelledby="conteudo">
      <div className="flex items-center justify-between">
        <h2 id="conteudo" className="text-sm font-semibold">
          Planos e dicas
        </h2>
        <Link href={todos} className="text-xs font-semibold text-primary">
          Ver tudo
        </Link>
      </div>
      {fixada && (
        <Link
          href={`${todos}?tab=tips`}
          className="flex items-start gap-3 rounded-2xl border border-subtle bg-card p-3 hover:bg-accent/40"
        >
          <Pin size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{fixada.title}</span>
            <span className="line-clamp-2 block text-xs text-muted-foreground">
              {markdownLitePlainText(fixada.body)}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}
      {recentes.length > 0 && (
        <ul className="space-y-2" aria-label="Planos prontos recentes">
          {recentes.map((t) => (
            <li key={t.id}>
              <TemplateCard template={t} href={`${todos}/${t.id}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

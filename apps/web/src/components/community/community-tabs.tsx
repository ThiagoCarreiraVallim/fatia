'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { communityTabs, activeCommunityTab, forYouApi } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { communityKeys } from './query-keys';

/**
 * As abas da comunidade para o membro: Mural (a raiz), Para você (com o número
 * do que falta), Desafios e Conteúdo. A Agenda da prancha Cm-03 chega com a #397.
 */
export function CommunityTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname() ?? '';
  const active = activeCommunityTab(pathname);
  const forYou = useQuery({
    queryKey: communityKeys.forYou(groupId),
    queryFn: () => forYouApi.get(groupId),
  });
  const count = forYou.data?.count ?? 0;
  return (
    <nav aria-label="Seções da comunidade" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-subtle">
        {communityTabs(groupId).map((t) => (
          <li key={t.tab}>
            <Link
              href={t.href}
              aria-current={active === t.tab ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 text-sm',
                active === t.tab
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.tab === 'for-you' && count > 0 && (
                <span
                  aria-label={`${count} para ver`}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
                >
                  {count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

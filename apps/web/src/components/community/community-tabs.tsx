'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { communityTabs, activeCommunityTab } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/** As abas da comunidade para o membro: Início, Mural, Desafios, Planos e dicas. */
export function CommunityTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname() ?? '';
  const ativa = activeCommunityTab(pathname);
  return (
    <nav aria-label="Seções da comunidade" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b border-subtle">
        {communityTabs(groupId).map((t) => (
          <li key={t.tab}>
            <Link
              href={t.href}
              aria-current={ativa === t.tab ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm',
                ativa === t.tab
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

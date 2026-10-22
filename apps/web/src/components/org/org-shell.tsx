'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ShieldOff } from 'lucide-react';
import {
  activePanelSection,
  canOpenPanel,
  groupsApi,
  panelHref,
  panelSections,
  teamRoleLabel,
  type MyGroup,
} from '@fatia/api-client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createContext, useContext, type ReactNode } from 'react';
import { orgKeys } from '@/components/community/query-keys';

const OrgGroupContext = createContext<MyGroup | null>(null);

/** A comunidade do painel aberto, já conferida como da equipe. */
export function useOrgGroup(): MyGroup {
  const g = useContext(OrgGroupContext);
  if (!g) throw new Error('useOrgGroup fora do painel');
  return g;
}

/**
 * A moldura do painel: confere que quem abriu é da equipe (dono ou
 * profissional) e mostra as seções do papel — barra lateral no desktop, abas
 * roláveis no celular. A API continua sendo o portão de cada leitura.
 */
export function OrgShell({ children }: { children: ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const pathname = usePathname();
  const grupo = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    retry: false,
  });

  if (grupo.isLoading) {
    return (
      <div className="space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!grupo.data || !canOpenPanel(grupo.data)) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          icon={ShieldOff}
          title="Painel indisponível"
          description="O painel é de quem administra ou atende nesta comunidade."
          action={
            <Link href="/community" className={buttonVariants({ variant: 'outline' })}>
              Minhas comunidades
            </Link>
          }
        />
      </div>
    );
  }

  const g = grupo.data;
  const secoes = panelSections(g.role);
  const ativa = activePanelSection(pathname);

  return (
    <OrgGroupContext.Provider value={g}>
      <div className="md:flex md:gap-8 md:px-6 md:pt-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <p className="truncate px-2 text-sm font-bold text-foreground">{g.name}</p>
          <p className="px-2 text-xs text-muted-foreground">{teamRoleLabel(g.role)}</p>
          <nav aria-label="Seções do painel" className="mt-4">
            <ul className="space-y-0.5">
              {secoes.map((s) => (
                <li key={s.section}>
                  <Link
                    href={panelHref(g.id, s.section)}
                    aria-current={s.section === ativa ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      s.section === ativa ? 'bg-card text-primary' : 'text-foreground',
                    )}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <nav
          aria-label="Seções do painel"
          className="sticky top-14 z-30 -mt-px flex gap-1 overflow-x-auto border-b border-subtle bg-background/95 px-3 py-2 backdrop-blur md:hidden"
        >
          {secoes.map((s) => (
            <Link
              key={s.section}
              href={panelHref(g.id, s.section)}
              aria-current={s.section === ativa ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold',
                s.section === ativa
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="min-w-0 flex-1 px-4 pt-4 pb-16 md:px-0 md:pt-0">{children}</div>
      </div>
    </OrgGroupContext.Provider>
  );
}

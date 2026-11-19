'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CloudOff,
  Crown,
  Dumbbell,
  Eye,
  Gift,
  LayoutGrid,
  Link2,
  LogOut,
  Megaphone,
  MessageSquareText,
  PanelLeft,
  Plus,
  Search,
  Settings,
  ShieldOff,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  activePanelSection,
  ApiError,
  canOpenPanel,
  groupsApi,
  panelApi,
  panelBreadcrumb,
  panelHref,
  panelNav,
  panelSections,
  PANEL_FOOTER_SECTIONS,
  teamRoleLabel,
  usersApi,
  type MyGroup,
  type PanelSection,
} from '@fatia/api-client';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupAvatar } from '@/components/community/group-avatar';
import { useTopBarCurrentTitle } from '@/components/layout/app-top-bar';
import { leaveWebPush } from '@/components/profile/sign-out-button';
import { cn } from '@/lib/utils';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { orgKeys } from '@/components/community/query-keys';
import { AnnouncementEditor } from './announcement-editor';
import { PanelSearch } from './panel-search';
import { readNavPrefs, writeNavPrefs, type NavPrefs } from './panel-prefs';
import { SidePanel, SidePanelProvider, useSidePanel } from './side-panel';

const OrgGroupContext = createContext<MyGroup | null>(null);

/** A comunidade do painel aberto, já conferida como da equipe. */
export function useOrgGroup(): MyGroup {
  const g = useContext(OrgGroupContext);
  if (!g) throw new Error('useOrgGroup fora do painel');
  return g;
}

const ICONE: Record<PanelSection, LucideIcon> = {
  overview: LayoutGrid,
  members: Users,
  invites: Link2,
  seats: Crown,
  content: BookOpen,
  exercises: Dumbbell,
  moderation: Megaphone,
  announcements: MessageSquareText,
  challenges: Trophy,
  benefits: Gift,
  agent: Bot,
  settings: Settings,
};

const ROLE_SHORT = {
  OWNER: 'dono',
  PROFESSIONAL: 'profissional',
  CREATOR: 'criador',
  MEMBER: 'membro',
};

/**
 * A moldura do painel: confere que quem abriu é da equipe (dono ou
 * profissional) e desenha o painel base (#398) — menu lateral em grupos,
 * topo com migalha, busca ⌘K e o painel lateral. A API continua sendo o
 * portão de cada leitura.
 */
export function OrgShell({ children }: { children: ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    retry: false,
  });

  if (group.isLoading) {
    return (
      <div className="space-y-3 px-4 pt-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  // Falha de rede ou da API não é "você não tem acesso": como no app, o erro
  // diz que falhou e oferece de novo; só o 404 (não é da comunidade) nega.
  const denied = group.isError && group.error instanceof ApiError && group.error.isNotFound;
  if (group.isError && !denied) {
    return (
      <div className="px-4 pt-8">
        <EmptyState
          icon={CloudOff}
          title="Não deu para abrir o painel"
          description="Tente de novo em alguns instantes."
          action={
            <Button variant="outline" onClick={() => void group.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </div>
    );
  }

  if (!group.data || !canOpenPanel(group.data)) {
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

  return (
    <OrgGroupContext.Provider value={group.data}>
      <SidePanelProvider>
        <PanelFrame g={group.data}>{children}</PanelFrame>
      </SidePanelProvider>
    </OrgGroupContext.Provider>
  );
}

function PanelFrame({ g, children }: { g: MyGroup; children: ReactNode }) {
  const pathname = usePathname();
  const painel = useSidePanel();
  const [prefs, setPrefs] = useState<NavPrefs>(() => readNavPrefs(g.membershipId));
  const [busca, setBusca] = useState(false);
  const counts = useQuery({
    queryKey: orgKeys.panelCounts(g.id),
    queryFn: () => panelApi.counts(g.id),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBusca(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const muda = (p: NavPrefs) => {
    setPrefs(p);
    writeNavPrefs(g.membershipId, p);
  };
  const pode = new Set(panelSections(g.role).map((s) => s.section));
  const comunica = pode.has('announcements');
  const abrirComunicado = () =>
    painel.open({
      title: 'Novo comunicado',
      subtitle: `Mural de ${g.name}`,
      body: <AnnouncementEditor group={g} onDone={painel.close} />,
    });
  const active = activePanelSection(pathname);

  return (
    <div className="md:flex md:h-dvh md:overflow-hidden md:bg-sunken">
      <Sidebar g={g} prefs={prefs} onPrefs={muda} counts={counts.data} active={active} />

      <MobileNav g={g} counts={counts.data} active={active} onSearch={() => setBusca(true)} />

      <div className="min-w-0 flex-1 md:flex md:p-2 md:pl-0">
        <main className="flex min-w-0 flex-1 flex-col md:overflow-hidden md:rounded-2xl md:bg-background md:shadow-[0_0_0_1px_hsl(var(--border))]">
          <header className="hidden h-[52px] shrink-0 items-center gap-2.5 border-b border-border pl-3 pr-4 md:flex">
            <button
              type="button"
              onClick={() => muda({ ...prefs, collapsed: !prefs.collapsed })}
              aria-label={prefs.collapsed ? 'Abrir menu' : 'Recolher menu'}
              aria-pressed={prefs.collapsed}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeft aria-hidden className="h-4 w-4" />
            </button>
            <span aria-hidden className="h-4 w-px bg-border" />
            <Breadcrumb groupId={g.id} pathname={pathname} />
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setBusca(true)}
              className="hidden h-9 w-56 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:text-foreground lg:flex"
            >
              <Search aria-hidden className="h-4 w-4" />
              Buscar membro ou tela
              <kbd className="ml-auto rounded px-1 text-[11px] font-bold shadow-[inset_0_0_0_1px_hsl(var(--border))]">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setBusca(true)}
              aria-label="Buscar (⌘K)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))] hover:text-foreground lg:hidden"
            >
              <Search aria-hidden className="h-4 w-4" />
            </button>
            {comunica && (
              <Button variant="outline" size="sm" onClick={abrirComunicado}>
                <Megaphone aria-hidden className="h-4 w-4" /> Comunicado
              </Button>
            )}
            {pode.has('content') && (
              <Link href={panelHref(g.id, 'content')} className={buttonVariants({ size: 'sm' })}>
                <Plus aria-hidden className="h-4 w-4" /> Novo plano
              </Link>
            )}
          </header>
          <div className="min-w-0 flex-1 px-4 pb-16 pt-4 md:overflow-y-auto md:px-6 md:pb-8 md:pt-5">
            {children}
          </div>
        </main>
        <SidePanel />
      </div>

      <PanelSearch group={g} open={busca} onOpenChange={setBusca} />
    </div>
  );
}

function Breadcrumb({ groupId, pathname }: { groupId: string; pathname: string }) {
  const migalha = panelBreadcrumb(pathname);
  const titulo = useTopBarCurrentTitle();
  const section = activePanelSection(pathname);
  const raiz = pathname.replace(/\/$/, '') === panelHref(groupId, section);
  return (
    <nav aria-label="Você está em" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {migalha.group && (
          <li className="flex shrink-0 items-center gap-1">
            {migalha.group}
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </li>
        )}
        {raiz ? (
          <li className="truncate font-semibold text-foreground" aria-current="page">
            {migalha.label}
          </li>
        ) : (
          <>
            <li className="flex shrink-0 items-center gap-1">
              <Link href={panelHref(groupId, section)} className="hover:text-foreground">
                {migalha.label}
              </Link>
              <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </li>
            <li className="truncate font-semibold text-foreground" aria-current="page">
              {titulo ?? 'Detalhe'}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

function Contador({ n, className }: { n: number | null; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        'ml-auto rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-foreground',
        className,
      )}
    >
      {n}
    </span>
  );
}

function ItemMenu({
  href,
  label,
  icon: Icone,
  count,
  current,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number | null;
  current?: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? (count ? `${label}, ${count}` : label) : undefined}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'relative flex h-8 shrink-0 items-center gap-2.5 rounded-lg text-[13.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        collapsed ? 'w-10 justify-center' : 'px-2.5',
        current
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icone aria-hidden className={cn('h-4 w-4 shrink-0', current && 'text-primary-text')} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && <Contador n={count ?? null} />}
      {collapsed && count ? (
        <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
      ) : null}
    </Link>
  );
}

function Sidebar({
  g,
  prefs,
  onPrefs,
  counts,
  active,
}: {
  g: MyGroup;
  prefs: NavPrefs;
  onPrefs: (p: NavPrefs) => void;
  counts: Parameters<typeof panelNav>[1];
  active: PanelSection;
}) {
  const nav = panelNav(g.role, counts);
  const pode = new Set(panelSections(g.role).map((s) => s.section));
  const recolhido = prefs.collapsed;
  const alterna = (key: string) =>
    onPrefs({
      ...prefs,
      closedGroups: prefs.closedGroups.includes(key)
        ? prefs.closedGroups.filter((k) => k !== key)
        : [...prefs.closedGroups, key],
    });

  return (
    <aside
      aria-label="Menu do painel"
      className={cn(
        'hidden shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2.5 transition-[width] duration-300 md:flex',
        recolhido ? 'w-14 items-center' : 'w-[248px]',
      )}
    >
      <div className={cn('flex h-12 shrink-0 items-center gap-2.5', !recolhido && 'px-1.5')}>
        <GroupAvatar name={g.name} url={g.avatarUrl} size={recolhido ? 32 : 30} />
        {!recolhido && (
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-sm">{g.name}</b>
            <span className="block truncate text-xs text-muted-foreground">
              {teamRoleLabel(g.role)}
            </span>
          </span>
        )}
      </div>

      <nav aria-label="Seções do painel" className="mt-1 flex flex-col gap-0.5">
        {nav.map((grupo) => {
          const fechado = !recolhido && prefs.closedGroups.includes(grupo.key);
          return (
            <div key={grupo.key} className="flex flex-col gap-0.5">
              {recolhido ? (
                <span aria-hidden className="mx-auto my-1.5 h-px w-6 bg-border" />
              ) : (
                <button
                  type="button"
                  onClick={() => alterna(grupo.key)}
                  aria-expanded={!fechado}
                  className="mt-2 flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <span className="flex-1 text-left">{grupo.label}</span>
                  {fechado && <Contador n={grupo.count} />}
                  <ChevronDown
                    aria-hidden
                    className={cn('h-3.5 w-3.5 transition-transform', fechado && '-rotate-90')}
                  />
                </button>
              )}
              {!fechado &&
                grupo.items.map((it) => (
                  <ItemMenu
                    key={it.section}
                    href={panelHref(g.id, it.section)}
                    label={it.label}
                    icon={ICONE[it.section]}
                    count={it.count}
                    current={it.section === active}
                    collapsed={recolhido}
                  />
                ))}
            </div>
          );
        })}
      </nav>

      <div className="min-h-4 flex-1" />

      {PANEL_FOOTER_SECTIONS.filter((s) => pode.has(s)).map((s) => (
        <ItemMenu
          key={s}
          href={panelHref(g.id, s)}
          label="Configurações"
          icon={ICONE[s]}
          current={s === active}
          collapsed={recolhido}
        />
      ))}
      <ItemMenu
        href={`/community/${g.id}`}
        label="Ver como membro"
        icon={Eye}
        collapsed={recolhido}
      />
      <UserMenu role={g.role} collapsed={recolhido} />
    </aside>
  );
}

function UserMenu({ role, collapsed }: { role: MyGroup['role']; collapsed: boolean }) {
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const nome = me.data?.name ?? '';
  const iniciais =
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '·';
  const sair = async () => {
    await Promise.race([
      leaveWebPush().catch(() => undefined),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    window.location.assign('/api/logto/sign-out');
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu do perfil"
          className={cn(
            'mt-1 flex h-[54px] w-full shrink-0 items-center gap-2.5 border-t border-border pt-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'justify-center' : 'px-1.5',
          )}
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary text-xs font-bold"
          >
            {iniciais}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block truncate text-[13.5px]">{nome}</b>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_SHORT[role]}
                  {me.data?.email ? ` · ${me.data.email}` : ''}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/you">
            <User aria-hidden className="h-4 w-4" /> Meu perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void sair()}>
          <LogOut aria-hidden className="h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** No celular: busca no topo e as seções em fichas roláveis, com os contadores. */
function MobileNav({
  g,
  counts,
  active,
  onSearch,
}: {
  g: MyGroup;
  counts: Parameters<typeof panelNav>[1];
  active: PanelSection;
  onSearch: () => void;
}) {
  const itens = [
    ...panelNav(g.role, counts).flatMap((grupo) => grupo.items),
    ...PANEL_FOOTER_SECTIONS.filter((s) => panelSections(g.role).some((x) => x.section === s)).map(
      (s) => ({ section: s, label: 'Configurações', count: null }),
    ),
  ];
  return (
    <div className="sticky top-14 z-30 -mt-px border-b border-subtle bg-background/95 backdrop-blur md:hidden">
      <div className="px-3 pt-2">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 w-full items-center gap-2 rounded-xl bg-muted px-3 text-sm text-muted-foreground"
        >
          <Search aria-hidden className="h-4 w-4" />
          Buscar membro ou tela
        </button>
      </div>
      <nav aria-label="Seções do painel" className="flex gap-1 overflow-x-auto px-3 py-2">
        {itens.map((s) => (
          <Link
            key={s.section}
            href={panelHref(g.id, s.section)}
            aria-current={s.section === active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold',
              s.section === active
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
            )}
          >
            {s.label}
            {s.count ? (
              <span className="rounded-full bg-background/80 px-1.5 text-[11px] text-foreground">
                {s.count}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

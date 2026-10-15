'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { usersApi, type MenuSection } from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { MENU_ICON } from './nav-icons';
import { useNavMenu } from './use-nav-menu';

/** As seções do menu como lista de links. A barra lateral do desktop usa a mesma. */
export function MenuLinks({
  sections,
  onNavigate,
  compact = false,
}: {
  sections: MenuSection[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <>
      {sections.map((section) => (
        <nav key={section.title} aria-label={section.title} className="space-y-1">
          <h3 className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </h3>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = MENU_ICON[item.key];
              const current = pathname === item.href;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      current && 'bg-card',
                    )}
                  >
                    <Icon size={20} className="shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-semibold',
                          current ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {item.label}
                      </span>
                      {!compact && (
                        <span className="block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </>
  );
}

/** O "Mais" da barra de baixo: todas as telas que não estão na barra, em seções. */
export function MenuMais({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const sections = useNavMenu();
  const me = useQuery({ queryKey: ['users', 'me'], queryFn: () => usersApi.me() });
  const name = me.data?.name ?? '';
  const close = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh] px-4 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Menu</DrawerTitle>
          <DrawerDescription className="sr-only">Todas as telas do Fatia</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-5 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <Link
            href="/profile"
            onClick={close}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/5 bg-card px-4 py-3"
          >
            <span
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-base font-bold text-primary"
            >
              {(name || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1">
              <span className="block text-base font-bold">{name}</span>
              <span className="block text-xs text-muted-foreground">Ver perfil</span>
            </span>
            <ChevronRight size={18} className="text-muted-foreground" aria-hidden />
          </Link>
          <MenuLinks sections={sections} onNavigate={close} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import type { MenuSection } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { PlanBadge } from '@/components/billing/plan-badge';
import { MENU_ICON } from './nav-icons';

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
                        {item.locked && (
                          <>
                            <Lock
                              size={12}
                              className="ms-1.5 inline align-[-1px] text-muted-foreground"
                              aria-hidden
                            />
                            <PlanBadge tier="PRO" className="ms-1.5 px-1.5 py-0 text-[10px]" />
                            <span className="sr-only"> (exige o plano PRO)</span>
                          </>
                        )}
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

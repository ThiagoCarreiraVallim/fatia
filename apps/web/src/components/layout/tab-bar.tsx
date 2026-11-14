'use client';

import Link from 'next/link';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { AiButton } from './ai-button';

export interface TabBarItem {
  key: string;
  href: string;
  /** Nome da aba; a barra só mostra o ícone, o nome vai no `aria-label`. */
  label: string;
  icon: IconName;
}

/**
 * Barra de baixo do DS v2 (ADR 040, revisão de 2026-11-14): cinco abas só com
 * ícone e o botão redondo da IA no meio, um pouco acima da barra. Componente
 * visual: quem troca a barra atual (`bottom-nav.tsx`) por esta é a #369.
 *
 * Ícone sem texto exige `aria-label` em cada aba e `aria-current="page"` na
 * ativa; o ponto verde embaixo do ícone repete o estado sem depender da cor.
 */
export function TabBar({
  items,
  active,
  onAi,
  aiLabel = 'Falar com a IA',
  hidden = false,
}: {
  /** Quatro abas: duas antes e duas depois do botão da IA. */
  items: [TabBarItem, TabBarItem, TabBarItem, TabBarItem];
  active: string | null;
  onAi: () => void;
  aiLabel?: string;
  /** Some nas tarefas de foco (registro, treino em andamento). */
  hidden?: boolean;
}) {
  const tab = (item: TabBarItem) => {
    const on = item.key === active;
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-label={item.label}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'relative flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-fast',
          on ? 'text-foreground' : 'text-faint hover:text-foreground',
        )}
      >
        <Icon name={item.icon} size={24} />
        <i
          aria-hidden
          className={cn('h-1 w-1 rounded-full', on ? 'bg-primary' : 'bg-transparent')}
        />
      </Link>
    );
  };
  return (
    <nav
      aria-label="Navegação principal"
      hidden={hidden}
      className="fixed inset-x-0 bottom-0 z-50 h-[calc(72px+env(safe-area-inset-bottom))] border-t border-subtle bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="flex h-full items-center px-2">
        {tab(items[0])}
        {tab(items[1])}
        <div className="flex flex-1 justify-center">
          <AiButton onClick={onAi} label={aiLabel} className="-mt-7" />
        </div>
        {tab(items[2])}
        {tab(items[3])}
      </div>
    </nav>
  );
}

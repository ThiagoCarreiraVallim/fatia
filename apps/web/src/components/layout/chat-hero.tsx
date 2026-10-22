'use client';

import Link from 'next/link';
import { ChevronRight, Crown, Sparkles } from 'lucide-react';
import type { MenuItem } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { useNavMenu } from './use-nav-menu';

/**
 * O item do chat como o menu o monta (`menuSections`): ausente quando a
 * instância não tem a IA, com cadeado e indo para o plano quando a pessoa é
 * Free. O cartão aparece no "Mais" e no "+", e os dois precisam concordar
 * sobre isso — por isso saem da mesma consulta do menu.
 */
export function useChatMenuItem(): MenuItem | undefined {
  return useNavMenu()
    .flatMap((section) => section.items)
    .find((item) => item.key === 'chat');
}

/**
 * O cartão do chat, igual ao do app (`apps/mobile/src/components/layout/chat-hero.tsx`):
 * gradiente verde da marca e uma faixa de brilho que passa de tempos em tempos.
 * O brilho é o que o diferencia de "mais um item" do menu, e some para quem
 * pediu ao sistema menos movimento (`.chat-hero-shine`, em `globals.css`).
 */
export function ChatHero({
  item,
  onNavigate,
  className,
}: {
  item: MenuItem;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-3xl border border-primary px-5 py-6 shadow-[0_0_16px_hsl(var(--primary)/0.45)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'bg-[linear-gradient(135deg,hsl(var(--primary)/0.38)_0%,hsl(var(--primary)/0.1)_60%,hsl(var(--card))_100%)]',
        className,
      )}
    >
      <span aria-hidden data-testid="chat-hero-shine" className="chat-hero-shine" />
      <span
        aria-hidden
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
      >
        <Sparkles size={28} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-lg font-extrabold text-foreground">{item.label}</span>
          {item.locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-extrabold text-warning">
              <Crown size={12} aria-hidden />
              PRO
              <span className="sr-only"> (exige o plano PRO)</span>
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-foreground/80">{item.description}</span>
      </span>
      <ChevronRight size={22} aria-hidden className="relative shrink-0 text-primary" />
    </Link>
  );
}

'use client';

import type { ComponentProps } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';
import { floating } from '@/components/elements/surfaces';

/**
 * A rolagem da conversa, sobre o `use-stick-to-bottom` direto.
 *
 * Os elements do assistant-ui não cobrem esta peça: o `elements-scroll-anchor`
 * de lá é uma vitrine — ele guarda a própria lista de mensagens e as vai
 * revelando num `setInterval` de 1,3s. Serve para a página de demonstração, não
 * para uma conversa de verdade. O que dele vale aqui é o desenho do botão, que
 * vem da mesma receita `floating` do `surfaces.tsx`.
 *
 * `aria-live="off"` é obrigatório e não é detalhe: `role="log"` anuncia sozinho
 * cada mudança do conteúdo, e com streaming isso vira **um anúncio por token** —
 * a resposta fica impossível de acompanhar em leitor de tela. Quem anuncia é a
 * região de status do `ChatView`, uma vez por resposta.
 */
export function Conversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      role="log"
      aria-live="off"
      initial="smooth"
      resize="smooth"
      className={cn('relative flex-1 overflow-y-hidden', className)}
      {...props}
    />
  );
}

export function ConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return <StickToBottom.Content className={cn('flex flex-col gap-6 p-4', className)} {...props} />;
}

/** Só aparece quando a pessoa subiu a conversa — no fim ele seria ruído. */
export function ConversationScrollButton({ label }: { label: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => void scrollToBottom()}
      className={cn(
        floating,
        'fade-in slide-in-from-bottom-2 animate-in absolute inset-x-0 bottom-3 mx-auto flex size-8 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-px motion-reduce:animate-none',
      )}
    >
      <ArrowDownIcon className="size-4 opacity-60" />
    </button>
  );
}

'use client';

import { QuoteIcon, XIcon } from 'lucide-react';
import {
  ComposerPrimitive,
  SelectionToolbarPrimitive,
  type TextMessagePartComponent,
} from '@assistant-ui/react';
import { splitQuote } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { field, ghostButton } from '@/components/elements/surfaces';

/**
 * Citar um trecho da resposta na pergunta seguinte.
 *
 * Selecionar texto numa mensagem abre o botão "Citar"; o trecho fica acima do
 * campo, com um X, e no envio entra na frente da mensagem como bloco `> `
 * (`withQuote`). Ele vai no texto, e não no metadado, porque a conversão para o
 * LangChain descarta o metadado — no texto ele chega ao modelo e volta com a
 * conversa depois de um F5.
 */

export function BarraDeCitacao() {
  return (
    <SelectionToolbarPrimitive.Root className="rounded-full border border-border bg-background shadow-md">
      <SelectionToolbarPrimitive.Quote
        className={cn(ghostButton, 'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs')}
      >
        <QuoteIcon size={12} aria-hidden />
        Citar
      </SelectionToolbarPrimitive.Quote>
    </SelectionToolbarPrimitive.Root>
  );
}

/** O trecho escolhido, acima do campo, até sair com a mensagem ou com o X. */
export function CitacaoDoComposer() {
  return (
    <ComposerPrimitive.Quote
      aria-label="Trecho citado"
      className="flex shrink-0 items-start gap-2 px-4 pb-2"
    >
      <blockquote className="min-w-0 flex-1 border-l-2 border-primary pl-2.5 text-xs text-muted-foreground">
        <ComposerPrimitive.QuoteText className="line-clamp-3 whitespace-pre-wrap" />
      </blockquote>
      <ComposerPrimitive.QuoteDismiss
        aria-label="Tirar a citação"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <XIcon size={14} aria-hidden />
      </ComposerPrimitive.QuoteDismiss>
    </ComposerPrimitive.Quote>
  );
}

/** A fala da pessoa, com a citação do começo desenhada como citação. */
export function FalaComCitacao({ text }: { text: string }) {
  const { quote, text: resto } = splitQuote(text);
  if (!quote) return <>{text}</>;
  return (
    <>
      <blockquote
        className={cn(
          field,
          'mb-1.5 border-l-2 border-primary pl-2.5 text-xs text-muted-foreground',
          'line-clamp-4 whitespace-pre-wrap',
        )}
      >
        {quote}
      </blockquote>
      {resto}
    </>
  );
}

export const TextoDaPessoa: TextMessagePartComponent = ({ text }) => <FalaComCitacao text={text} />;

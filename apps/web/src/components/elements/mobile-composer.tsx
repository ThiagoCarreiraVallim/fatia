'use client';

import { type ComponentProps, type RefObject, useLayoutEffect, useRef } from 'react';
import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { field, inkButton, mono } from './surfaces';

/**
 * `elements-mobile-composer` do assistant-ui, adaptado. O Fatia é um PWA de
 * celular, então o composer de celular é o certo — não o de mesa, que carrega
 * anexo, comando de barra, menção e troca de modelo, nada disso existe aqui.
 *
 * O que mudou:
 *
 * **Campo de várias linhas.** O original é um `<input>`. Num chat isso corta a
 * pergunta longa numa linha que rola sozinha, e a pessoa não enxerga o que
 * escreveu antes de enviar. Virou `<textarea>` que cresce até um teto e então
 * rola.
 *
 * **Sem clipe e sem microfone.** O element deixa os dois desabilitados quando não
 * recebem handler, mas um botão cinza que nunca vai funcionar é promessa falsa
 * na barra mais vista da tela. Não há anexo nem voz no contrato do `/chat`.
 *
 * **Sem a fileira de ações rápidas**, que no original fica acima do campo: as
 * sugestões daqui moram no `EmptyState`, onde servem de primeiro empurrão. Uma
 * segunda fileira, permanente, comeria altura de tela num aparelho onde a
 * conversa já disputa espaço com duas barras fixas.
 *
 * **Rótulos em português e vindos de fora**, porque são eles que os testes de
 * acessibilidade cobram — a #221 nasceu de foco perdido, e o campo precisa ter
 * nome estável para ser reencontrado.
 */

/** Teto do campo antes de virar rolagem: ~5 linhas, o resto vira scroll. */
const ALTURA_MAXIMA = 128;

export function MobileComposer({
  value,
  keyboardOpen,
  running,
  label,
  placeholder,
  sendLabel,
  stopLabel,
  hint,
  ref,
  onValueChange,
  onSend,
  onStop,
  onFocus,
  onBlur,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  | 'children'
  // `ref` sai junto: no `div` ele é do `HTMLDivElement`, e aqui aponta para o
  // campo de texto — quem recebe é o `<textarea>`, não a caixa de fora.
  | 'ref'
  | 'value'
  | 'keyboardOpen'
  | 'running'
  | 'label'
  | 'placeholder'
  | 'onValueChange'
  | 'onSend'
  | 'onStop'
  | 'onFocus'
  | 'onBlur'
> & {
  value: string;
  keyboardOpen: boolean;
  running: boolean;
  label: string;
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  hint?: string;
  ref?: RefObject<HTMLTextAreaElement | null>;
  onValueChange?: (value: string) => void;
  onSend?: () => void;
  onStop?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const proprio = useRef<HTMLTextAreaElement>(null);
  const campo = ref ?? proprio;

  // A altura é recalculada do zero a cada valor: sem zerar antes de medir, o
  // `scrollHeight` só sabe crescer e o campo nunca volta ao tamanho de uma linha
  // depois que a mensagem é enviada.
  useLayoutEffect(() => {
    const elemento = campo.current;
    if (!elemento) return;
    elemento.style.height = 'auto';
    elemento.style.height = `${Math.min(elemento.scrollHeight, ALTURA_MAXIMA)}px`;
  }, [campo, value]);

  return (
    <div
      data-slot="mobile-composer"
      className={cn(
        'flex w-full flex-col gap-2.5 rounded-t-[20px] border-t border-foreground/[0.07] bg-background px-3 pt-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]',
        keyboardOpen ? 'pb-3' : 'pb-6',
        className,
      )}
      {...props}
    >
      <div className="flex items-end gap-2">
        <div
          className={cn(field, 'flex min-w-0 flex-1 items-center gap-2 rounded-[18px] px-3 py-2')}
        >
          <textarea
            ref={campo}
            rows={1}
            value={value}
            onChange={(event) => onValueChange?.(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return;
              // Teclado de composição (acento, IME): o Enter fecha o candidato,
              // não envia. Sem isto, digitar "ç" no Android manda a mensagem pela
              // metade.
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!running && value.trim() !== '') onSend?.();
            }}
            placeholder={placeholder}
            aria-label={label}
            /* `text-[16px]` não é escolha de estilo: abaixo de 16px o Safari do
               iPhone dá zoom ao focar o campo e a tela inteira sai do lugar. */
            className="min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-snug text-foreground/85 outline-none placeholder:text-foreground/30"
          />
        </div>

        <button
          type="button"
          aria-label={running ? stopLabel : sendLabel}
          onClick={running ? onStop : onSend}
          disabled={!running && value.trim() === ''}
          className={cn(
            inkButton,
            'flex size-9 shrink-0 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-25',
          )}
        >
          {running ? (
            <SquareIcon className="size-3 fill-current" />
          ) : (
            <ArrowUpIcon className="size-4" />
          )}
        </button>
      </div>

      {hint && keyboardOpen && (
        <span className={cn(mono, 'text-center text-foreground/25')}>{hint}</span>
      )}
    </div>
  );
}

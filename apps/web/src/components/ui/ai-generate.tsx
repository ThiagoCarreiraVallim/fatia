'use client';

import {
  AI_GENERATE_DRAFT_NOTE,
  AI_GENERATE_ERROR,
  aiGenerateLabel,
  type AiGenerateState,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import { Button } from './button';
import { Icon } from './icon';

/**
 * "Gerar com IA" nos editores do painel (prancha Componentes-plano · 1.7).
 * Enquanto gera: linhas pulsando no lugar onde o conteúdo vai cair, e o botão
 * respira — só nesse estado. O resultado entra como rascunho, nunca publicado
 * direto. Com "reduzir movimento", nada pulsa (`.anim-*` no globals.css).
 */
export function AiGenerate({
  title,
  state,
  onGenerate,
  lines = 3,
  children,
  className,
}: {
  title: string;
  state: AiGenerateState;
  onGenerate: () => void;
  /** Quantas linhas pulsam enquanto gera. */
  lines?: number;
  /** O conteúdo (o rascunho, quando houver). */
  children?: React.ReactNode;
  className?: string;
}) {
  const generating = state === 'generating';
  return (
    <section
      aria-label={title}
      aria-busy={generating}
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-h3 text-foreground">{title}</h3>
        <Button
          variant="ai"
          size="xs"
          disabled={generating}
          onClick={onGenerate}
          className={cn(generating && 'anim-breathe disabled:opacity-100')}
        >
          <Icon name="spark" size={16} />
          {aiGenerateLabel(state)}
        </Button>
      </div>
      {generating ? (
        <div role="status" aria-label="Gerando o rascunho" className="flex flex-col gap-2">
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className="anim-shim h-4 rounded-chip"
              style={{ width: `${92 - i * 14}%` }}
            />
          ))}
        </div>
      ) : (
        <>
          {state === 'draft' && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Badge variant="pending">Rascunho</Badge>
              <span>{AI_GENERATE_DRAFT_NOTE}</span>
            </div>
          )}
          {state === 'error' && (
            <p role="alert" className="text-[13px] text-danger">
              {AI_GENERATE_ERROR}
            </p>
          )}
          {children}
        </>
      )}
    </section>
  );
}

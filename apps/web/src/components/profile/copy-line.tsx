'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CopyLineProps {
  value: string;
  /** O que está sendo copiado, na língua do usuário: "Copiar endereço", "Copiar pergunta". */
  copyLabel: string;
  /** Endereço trunca (é longo e o começo basta para conferir); frase quebra em linhas. */
  wrap?: boolean;
}

/**
 * Um valor para o usuário copiar e colar no Claude. Copiar é o caminho principal de propósito:
 * digitar à mão um endereço no celular é a origem mais provável de "não conectou".
 */
export function CopyLine({ value, copyLabel, wrap = false }: CopyLineProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      // `navigator.clipboard` não existe fora de contexto seguro (http em rede local, que é
      // caminho comum num app self-hosted) e `writeText` também rejeita quando o navegador nega
      // a permissão. Sem este catch o clique não faz nada e não diz nada — o pior desfecho
      // possível numa tela cujo trabalho inteiro é tirar o usuário da dúvida.
      setState('failed');
    }
  }

  const failed = state === 'failed';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-muted/30 p-2">
        {/* Truncar economiza espaço enquanto o botão resolve. Quando ele falha, o texto passa a
            ser o único caminho, e um endereço cortado por reticências não dá para copiar à mão. */}
        <code className={`flex-1 text-xs ${wrap || failed ? 'break-words' : 'truncate'}`}>
          {value}
        </code>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          aria-label={copyLabel}
        >
          {state === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      {failed && (
        <p role="status" className="text-xs text-muted-foreground">
          Seu navegador não deixou copiar. Selecione o texto acima e copie à mão.
        </p>
      )}
    </div>
  );
}

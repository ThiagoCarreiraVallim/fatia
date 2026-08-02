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
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-muted/30 p-2">
      <code className={`flex-1 text-xs ${wrap ? 'break-words' : 'truncate'}`}>{value}</code>
      <Button type="button" size="icon" variant="ghost" onClick={handleCopy} aria-label={copyLabel}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

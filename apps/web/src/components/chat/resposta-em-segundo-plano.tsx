'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuiState } from '@assistant-ui/react';
import { toast } from 'sonner';
import { LoaderCircle } from 'lucide-react';

/**
 * A resposta do chat que continua chegando enquanto a pessoa está em outra
 * tela (ADR 035): um aviso discreto acima da barra de navegação e, quando ela
 * termina, "Resposta pronta" com o atalho para a conversa.
 */
export function RespostaEmSegundoPlano({ conversa }: { conversa: string | undefined }) {
  const rodando = useAuiState((s) => s.thread.isRunning);
  const estava = useRef(rodando);

  useEffect(() => {
    if (estava.current && !rodando && conversa) {
      toast('Resposta pronta', {
        description: 'O assistente terminou de responder.',
        action: { label: 'Abrir', onClick: () => window.location.assign(`/chat/${conversa}`) },
      });
    }
    estava.current = rodando;
  }, [rodando, conversa]);

  if (!rodando || !conversa) return null;
  return (
    <Link
      href={`/chat/${conversa}`}
      role="status"
      className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-popover px-4 text-sm text-foreground shadow-lg md:bottom-6"
    >
      <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
      Respondendo…
    </Link>
  );
}

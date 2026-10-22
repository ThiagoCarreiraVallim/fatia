'use client';

import { useSyncExternalStore } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A folha do sistema não muda com a página aberta: nada a assinar. */
const noSubscription = () => () => undefined;

/**
 * "Compartilhar" pela folha do sistema (Web Share), como o `Share.share` do
 * app: no celular o link do convite vai direto ao WhatsApp. Só aparece onde o
 * navegador tem a folha — no desktop sem ela, "Copiar" ao lado já resolve.
 * No servidor é sempre "não", para o HTML não divergir do cliente.
 */
export function ShareButton({
  text,
  url,
  label = 'Compartilhar',
}: {
  text: string;
  url?: string;
  label?: string;
}) {
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === 'function',
    () => false,
  );
  if (!canShare) return null;
  return (
    <Button
      type="button"
      size="sm"
      className="gap-1"
      onClick={() => {
        // Fechar a folha sem escolher rejeita a promessa: não é erro para avisar.
        navigator.share({ text, url }).catch(() => undefined);
      }}
    >
      <Share2 size={14} aria-hidden /> {label}
    </Button>
  );
}

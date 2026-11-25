'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AI_CONSENT_TEXTS, aiConsentBody, erroDoChat } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { floating, grayButton, limeButton } from '@/components/elements/surfaces';
import { CHAVE_DOS_ACEITES, useAceitar, useAceitesDaIa } from './catalogo';
import { useTurnError } from './chat-runtime-provider';

/**
 * O aceite da primeira conversa (prancha IA-Visao): para onde vão as mensagens, com o nome do
 * provedor e do modelo. Fica no lugar do campo enquanto não houver aceite — a API recusa o
 * turno com 403 `AI_CONSENT_REQUIRED` sem ele, e esse 403 também traz o aviso de volta.
 */
export function ChatConsentSheet() {
  const { data, isPending } = useAceitesDaIa();
  const router = useRouter();
  const queryClient = useQueryClient();
  const erro = useTurnError();
  const recusado = erro ? erroDoChat(erro).code === 'AI_CONSENT_REQUIRED' : false;
  useEffect(() => {
    // O aceite caiu (versão nova do texto, outro aparelho): relê o estado.
    if (recusado) void queryClient.invalidateQueries({ queryKey: CHAVE_DOS_ACEITES });
  }, [recusado, queryClient]);
  // Sem saber (erro ao ler), o aceite aparece: aceitar de novo é inofensivo, e escrever
  // sem aceite só daria num 403.
  if (isPending || data?.chat.accepted) return null;
  return <AiConsentCard onDecline={() => router.push('/')} />;
}

/**
 * O cartão do aceite da IA, também fora do chat: o ditado, a foto do prato e o rótulo passam
 * pelo mesmo aceite (o servidor recusa com 403 `AI_CONSENT_REQUIRED` sem ele). Quem mostra
 * decide o que "Agora não" faz; `onAccepted` avisa depois de gravado.
 */
export function AiConsentCard({
  onDecline,
  onAccepted,
  className,
}: {
  onDecline: () => void;
  onAccepted?: () => void;
  className?: string;
}) {
  const aceitar = useAceitar();
  const { data, isError, refetch } = useAceitesDaIa();
  const textos = AI_CONSENT_TEXTS.chat;
  // Os nomes do provedor e do modelo vêm da API: sem eles, não há o que aceitar ainda.
  const corpo = data?.processor ? aiConsentBody('chat', data.processor) : null;
  return (
    <section
      role="dialog"
      aria-labelledby="aceite-do-chat"
      className={cn(floating, 'mx-3 mb-3 flex shrink-0 flex-col gap-3 rounded-3xl p-5', className)}
    >
      <h2 id="aceite-do-chat" className="text-base font-bold text-foreground">
        {textos.title}
      </h2>
      {corpo ? (
        <p className="text-sm leading-relaxed text-foreground/75">{corpo}</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-foreground/75">
          Não consegui carregar o aviso.{' '}
          <button
            type="button"
            onClick={() => void refetch()}
            className="font-semibold text-success underline"
          >
            Tentar de novo
          </button>
        </p>
      ) : (
        <p className="text-sm text-foreground/60">Carregando o aviso…</p>
      )}
      <Link
        href="/privacy"
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {textos.link}
      </Link>
      {aceitar.isError ? (
        <p role="alert" className="text-xs text-danger">
          Não consegui gravar o aceite. Tente de novo.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!corpo || aceitar.isPending}
          onClick={() => aceitar.mutate('chat', { onSuccess: () => onAccepted?.() })}
          className={cn(limeButton, 'flex-1 rounded-full px-4 py-2.5 text-sm font-bold')}
        >
          {textos.accept}
        </button>
        <button
          type="button"
          onClick={onDecline}
          className={cn(grayButton, 'flex-1 rounded-full px-4 py-2.5 text-sm font-semibold')}
        >
          {textos.decline}
        </button>
      </div>
    </section>
  );
}

/**
 * O campo só aparece com o aceite confirmado: carregando ou sem conseguir ler, não. Escrever
 * só para ouvir um 403 seria pior que esperar o aceite.
 */
export function useChatUnlocked(): boolean {
  const { data } = useAceitesDaIa();
  return data?.chat.accepted === true;
}

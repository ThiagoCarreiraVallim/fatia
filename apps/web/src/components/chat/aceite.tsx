'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AI_CONSENT_TEXTS, erroDoChat } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { floating, ghostButton, inkButton } from '@/components/elements/surfaces';
import { CHAVE_DOS_ACEITES, useAceitar, useAceitesDaIa, useChaveDaBusca } from './catalogo';
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
  const textos = AI_CONSENT_TEXTS.chat;
  return (
    <section
      role="dialog"
      aria-labelledby="aceite-do-chat"
      className={cn(floating, 'mx-3 mb-3 flex shrink-0 flex-col gap-3 rounded-3xl p-5', className)}
    >
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-success"
      >
        <ShieldCheck size={20} />
      </span>
      <h2 id="aceite-do-chat" className="text-lg font-bold text-foreground">
        {textos.title}
      </h2>
      <p className="text-sm leading-relaxed text-foreground/75">{textos.body}</p>
      <Link href="/privacy" className="text-sm font-semibold text-success underline">
        {textos.link}
      </Link>
      {aceitar.isError ? (
        <p role="alert" className="text-xs text-danger">
          Não consegui gravar o aceite. Tente de novo.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={aceitar.isPending}
          onClick={() => aceitar.mutate('chat', { onSuccess: () => onAccepted?.() })}
          className={cn(inkButton, 'flex-1 rounded-full px-4 py-2.5 text-sm font-bold')}
        >
          {textos.accept}
        </button>
        <button
          type="button"
          onClick={onDecline}
          className={cn(ghostButton, 'flex-1 rounded-full px-4 py-2.5 text-sm')}
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

/**
 * A chave da busca na web no cabeçalho (prancha Al-M16): ligada, a IA pode buscar (pedindo o
 * aceite na primeira vez); desligada, ela responde só com o que sabe e os dados da pessoa.
 */
export function WebSearchSwitch() {
  const { data } = useAceitesDaIa();
  const mudar = useChaveDaBusca();
  if (!data) return null;
  const ligada = data.webSearchEnabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label="Buscar na web"
      title={ligada ? 'Busca na web ligada' : 'Busca na web desligada'}
      onClick={() => mudar.mutate(!ligada)}
      className={cn(
        ghostButton,
        'relative rounded-full p-2',
        ligada ? 'text-success' : 'text-foreground/45',
      )}
    >
      <Globe size={20} aria-hidden />
      {ligada ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
      ) : null}
    </button>
  );
}

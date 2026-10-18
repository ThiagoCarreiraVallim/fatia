'use client';

import { Bot } from 'lucide-react';
import { FATIA_AGENT_NAME } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { useAgenteDaConversa, useAgentesDoChat, useEscolhaDoAgente } from './chat-runtime-provider';

/**
 * O agente da comunidade no chat (Fase 7c, ADR 031): quem responde, e a escolha
 * numa conversa nova. O assistente da Fatia continua sem enfeite — só o agente
 * de uma comunidade ganha nome e avatar na conversa.
 */

export function AgentAvatar({ url, size = 'md' }: { url: string | null; size?: 'sm' | 'md' }) {
  const lado = size === 'sm' ? 'h-6 w-6' : 'h-12 w-12';
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn(lado, 'shrink-0 rounded-full object-cover')} />;
  }
  return (
    <span
      className={cn(
        lado,
        'flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary',
      )}
    >
      <Bot size={size === 'sm' ? 14 : 22} aria-hidden />
    </span>
  );
}

/** Acima de cada resposta, quando quem responde é o agente de uma comunidade. */
export function AutorDaResposta() {
  const agente = useAgenteDaConversa();
  if (!agente) return null;
  return (
    <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
      <AgentAvatar url={agente.avatarUrl} size="sm" />
      {agente.name}
    </p>
  );
}

/** A linha abaixo da barra de topo: com quem é a conversa, ou a dica de sempre. */
export function LinhaDoAgente() {
  const agente = useAgenteDaConversa();
  if (agente === undefined) return <p className="px-5 pb-2 text-sm">&nbsp;</p>;
  if (!agente) {
    return (
      <p className="px-5 pb-2 text-sm text-muted-foreground">
        Peça para registrar refeição, consultar treino ou ver sua evolução.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 px-5 pb-2 text-sm text-muted-foreground">
      <AgentAvatar url={agente.avatarUrl} size="sm" />
      <span>
        {'Conversando com '}
        <strong className="font-semibold text-foreground">{agente.name}</strong>
        {', o agente da sua comunidade.'}
      </span>
    </p>
  );
}

/**
 * Com quem conversar, na conversa nova. Só aparece para quem tem algum agente de
 * comunidade para escolher; a escolha vale até a primeira mensagem, que grava.
 */
export function SeletorDeAgente() {
  const { data } = useAgentesDoChat();
  const { escolhido, escolher } = useEscolhaDoAgente();
  if (!data || data.agents.length === 0) return null;
  const atual = escolhido === undefined ? data.defaultGroupId : escolhido;
  const opcoes = [
    { groupId: null, name: FATIA_AGENT_NAME, detalhe: 'Assistente da Fatia', avatarUrl: null },
    ...data.agents.map((a) => ({
      groupId: a.groupId,
      name: a.name,
      detalhe: a.communityName,
      avatarUrl: a.avatarUrl,
    })),
  ];
  return (
    <div role="radiogroup" aria-label="Com quem conversar" className="flex flex-wrap gap-2">
      {opcoes.map((o) => (
        <label
          key={o.groupId ?? 'fatia'}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-left has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        >
          <input
            type="radio"
            name="agente-do-chat"
            className="sr-only"
            checked={atual === o.groupId}
            onChange={() => escolher(o.groupId)}
          />
          <AgentAvatar url={o.avatarUrl} size="sm" />
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{o.name}</span>
            <span className="block text-xs text-muted-foreground">{o.detalhe}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

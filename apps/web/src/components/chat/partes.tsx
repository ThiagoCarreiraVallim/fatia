'use client';

import { useState } from 'react';
import { Streamdown } from 'streamdown';
import {
  useMessagePartText,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { ToolCall, type ToolCallState } from '@/components/elements/tool-call';
import { useTitulosDasTools } from './chat-runtime-provider';

/**
 * As partes de uma mensagem do assistente: o texto em markdown e as tools.
 *
 * O texto continua no `streamdown`: o agente responde em markdown, e a família de
 * elements renderiza texto puro — trocar apagaria negrito, lista e tabela de
 * "seu almoço teve **42 g** de proteína".
 */

export const TextoDoAssistente: TextMessagePartComponent = () => {
  const { text } = useMessagePartText();
  return <Streamdown className="w-full text-sm leading-relaxed">{text}</Streamdown>;
};

/** O element pede texto; argumento e resultado do MCP chegam como JSON qualquer. */
function comoTexto(valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') return '—';
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
}

/** `log_meal` → "Log meal", quando o `/mcp` não mandou título. Rótulo tosco é melhor que nome cru. */
function rotuloDoNome(nome: string): string {
  return nome.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * Uma chamada de tool, recolhida por padrão.
 *
 * O **título** vem do catálogo que o agente anuncia (`catalog`), que é o `title`
 * de cada tool no `/mcp` — "Registrar refeição". A tabela de rótulos à mão que
 * existia antes cobria 10 das 35 escritas e apodrecia a cada tool nova. O nome
 * técnico continua na etiqueta monoespaçada: é o dado que torna a ação auditável.
 */
export const ChamadaDeTool: ToolCallMessagePartComponent = ({
  toolName,
  args,
  argsText,
  result,
  isError,
  status,
}) => {
  const titulos = useTitulosDasTools();
  const [aberto, setAberto] = useState(false);
  const estado: ToolCallState =
    status.type === 'running' || status.type === 'requires-action'
      ? 'running'
      : isError || (status.type === 'incomplete' && status.reason === 'error')
        ? 'error'
        : 'done';
  const titulo = titulos[toolName] ?? rotuloDoNome(toolName);
  const pedido = argsText?.trim() ? argsText : comoTexto(args);

  return (
    <ToolCall
      state={estado}
      query={toolName}
      activeLabel={status.type === 'requires-action' ? `${titulo} · aguardando você` : titulo}
      label={titulo}
      errorLabel={`${titulo} · falhou`}
      request={pedido === '{}' ? '—' : pedido}
      result={comoTexto(result)}
      open={aberto}
      onOpenChange={setAberto}
      className="max-w-none"
    />
  );
};

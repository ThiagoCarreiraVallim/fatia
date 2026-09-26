import type { LangChainMessage, LangGraphInterruptState } from '@assistant-ui/react-langgraph';
import type { ChatHistoryMessage, ChatResumeValue } from '@fatia/api-client';

/**
 * A conversa gravada no `apps/api`, na forma que o runtime do assistant-ui redesenha.
 *
 * O que volta de um F5 é o que `Message` guarda: o texto de cada fala e o **nome**
 * de cada tool que o assistente chamou (o argumento de uma chamada carrega dado
 * de saúde e já está no domínio de destino — ver `Message.tools` no schema). Por
 * isso as tools voltam como chamadas concluídas, sem argumento nem resultado: o
 * que se preserva é a auditoria de "o assistente registrou uma refeição aqui".
 */

type MensagemDoAssistente = Extract<LangChainMessage, { type: 'ai' }>;
type ResultadoDeTool = Extract<LangChainMessage, { type: 'tool' }>;

function doAssistente(linha: ChatHistoryMessage): LangChainMessage[] {
  const tools = linha.tools ?? [];
  if (tools.length === 0) {
    return linha.content ? [{ id: linha.id, type: 'ai', content: linha.content }] : [];
  }

  // A chamada e o resultado lado a lado, para o runtime desenhar a tool como
  // concluída. O texto da resposta fica na mesma mensagem, com o id da linha —
  // é por ele que o voto grava na resposta certa.
  const chamadas = tools.map((tool, indice) => ({
    id: `${linha.id}:${indice}`,
    name: tool.name,
    args: {},
  }));
  const mensagem: MensagemDoAssistente = {
    id: linha.id,
    type: 'ai',
    content: linha.content,
    tool_calls: chamadas,
  };
  const resultados: ResultadoDeTool[] = chamadas.map((chamada) => ({
    id: `${chamada.id}:resultado`,
    type: 'tool',
    tool_call_id: chamada.id,
    name: chamada.name,
    content: '',
    status: 'success',
  }));
  return [mensagem, ...resultados];
}

/**
 * As linhas, em ordem cronológica, como mensagens do LangChain.
 *
 * Só fala de pessoa e de assistente com conteúdo: uma linha vazia viraria bolha
 * em branco.
 */
/** A foto não é guardada (ADR 004); depois de recarregar, fica o aviso de que ela existiu. */
export const AVISO_DE_FOTO = '📷 Foto enviada — ela não fica guardada.';

export function historicoParaMensagens(linhas: readonly ChatHistoryMessage[]): LangChainMessage[] {
  return linhas.flatMap((linha): LangChainMessage[] => {
    if (linha.role === 'user') {
      if (!linha.content) return [];
      const fotos = linha.metadata?.photos ?? 0;
      const content = fotos > 0 ? `${linha.content}\n\n${AVISO_DE_FOTO}` : linha.content;
      return [{ id: linha.id, type: 'human', content }];
    }
    return doAssistente(linha);
  });
}

/**
 * A pausa que ainda espera resposta, quando a conversa terminou nela.
 *
 * Só a da **última** linha: uma pausa numa linha anterior já foi respondida (ou
 * abandonada) — o `apps/api` a limpa no turno seguinte, e isto é a segunda
 * barreira. Devolvê-la ao runtime é o que faz o cartão voltar depois de um F5.
 */
export function pausaPendente(
  linhas: readonly ChatHistoryMessage[],
): LangGraphInterruptState | undefined {
  const ultima = linhas.at(-1);
  if (ultima?.role !== 'assistant') return undefined;
  if (ultima.metadata?.status !== 'interrupted') return undefined;
  const pausa = ultima.metadata.interrupt;
  if (!pausa?.value) return undefined;
  // O `id` não está no tipo da biblioteca, mas é ele que prova a qual pausa a
  // resposta responde — o agente recusa um id que não é o pendente.
  return { value: pausa.value, resumable: true, id: pausa.id } as LangGraphInterruptState;
}

/**
 * A retomada do LangGraph carrega uma STRING, e a nossa carrega
 * `{ interruptId, value }`. Daí o JSON no meio.
 */
export function codificarRetomada(interruptId: string, value: ChatResumeValue): string {
  return JSON.stringify({ interruptId, value });
}

export function decodificarRetomada(bruta: string): {
  interruptId: string;
  value: ChatResumeValue;
} {
  try {
    const lida: unknown = JSON.parse(bruta);
    if (
      lida &&
      typeof lida === 'object' &&
      'interruptId' in lida &&
      typeof (lida as { interruptId: unknown }).interruptId === 'string'
    ) {
      return lida as { interruptId: string; value: ChatResumeValue };
    }
  } catch {
    // Texto puro é uma resposta simples, e não um envelope.
  }
  return { interruptId: '', value: bruta };
}

/** O texto da última fala da pessoa, qualquer que seja a forma do conteúdo. */
export function textoDaMensagem(mensagem: LangChainMessage | undefined): string {
  const conteudo = mensagem?.content;
  if (typeof conteudo === 'string') return conteudo;
  if (!Array.isArray(conteudo)) return '';
  return conteudo
    .map((parte) =>
      parte && typeof parte === 'object' && 'type' in parte && parte.type === 'text'
        ? String((parte as { text?: unknown }).text ?? '')
        : '',
    )
    .join('');
}

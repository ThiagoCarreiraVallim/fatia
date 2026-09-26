import type { LangChainMessage, LangGraphInterruptState } from '@assistant-ui/react-langgraph';
import type { ChatArtifact, ChatHistoryMessage, ChatResumeValue } from '@fatia/api-client';

/**
 * A conversa gravada no `apps/api`, na forma que o runtime do assistant-ui redesenha.
 *
 * O que volta de um F5 é o que `Message` guarda: o texto de cada fala, as tools
 * que o assistente chamou (com o id e o desfecho — deu certo, falhou e por quê,
 * foi recusada) e o cartão de cada uma. O **resultado** de uma tool não volta: ele
 * carrega dado de saúde que já está no domínio de destino, e o que se preserva é
 * a auditoria de "o assistente registrou uma refeição aqui, e deu certo".
 */

/**
 * O desfecho que a tela escreve para a chamada que nunca rodou. Começa com o
 * mesmo texto do `NAO_EXECUTADA` do agente, que é o que o passo reconhece como
 * "não chegou a rodar" (ver `stepState`).
 */
export const NEVER_RAN = 'Não executada: a conversa seguiu antes de esta chamada rodar.';

type MensagemDoAssistente = Extract<LangChainMessage, { type: 'ai' }>;
type ResultadoDeTool = Extract<LangChainMessage, { type: 'tool' }>;
type ToolResult = NonNullable<NonNullable<ChatHistoryMessage['metadata']>['toolResults']>[number];

/**
 * Linha gravada antes de a metadata ter `toolCalls` só tem o nome: a chamada
 * ganha um id sintético e aparece como feita, que é o que a tela mostrava antes.
 */
function callsOf(linha: ChatHistoryMessage): { id: string; name: string; legacy: boolean }[] {
  const gravadas = linha.metadata?.toolCalls;
  if (gravadas?.length) return gravadas.map((c) => ({ ...c, legacy: false }));
  return (linha.tools ?? []).map((tool, indice) => ({
    id: `${linha.id}:${indice}`,
    name: tool.name,
    legacy: true,
  }));
}

function assistantMessages(
  linha: ChatHistoryMessage,
  results: ReadonlyMap<string, ToolResult>,
): LangChainMessage[] {
  const chamadas = callsOf(linha);
  if (chamadas.length === 0) {
    return linha.content ? [{ id: linha.id, type: 'ai', content: linha.content }] : [];
  }

  // A chamada e o resultado lado a lado, para o runtime desenhar a tool como
  // concluída. O texto da resposta fica na mesma mensagem, com o id da linha —
  // é por ele que o voto grava na resposta certa.
  const mensagem: MensagemDoAssistente = {
    id: linha.id,
    type: 'ai',
    content: linha.content,
    tool_calls: chamadas.map(({ id, name }) => ({ id, name, args: {} })),
  };
  const pendente = linha.metadata?.status === 'interrupted';
  const resultados: ResultadoDeTool[] = chamadas.flatMap((chamada) => {
    const desfecho = results.get(chamada.id);
    // Sem desfecho numa pausa ainda aberta: a chamada espera a pessoa, e o cartão
    // da pausa é quem responde. Inventar "feito" aqui mentiria sobre uma escrita
    // que não aconteceu.
    if (!desfecho && pendente && !chamada.legacy) return [];
    // Sem desfecho em linha nenhuma, fora de uma pausa aberta: a chamada nunca
    // rodou — a pessoa escreveu outra coisa em vez de responder o cartão, ou o
    // turno caiu antes. O agente só diz isso ao modelo, e não grava. Mostrar
    // "feito" aqui seria dizer que uma escrita aconteceu.
    const nuncaRodou = !desfecho && !chamada.legacy;
    const falhou = nuncaRodou || desfecho?.status === 'error';
    return [
      {
        id: `${chamada.id}:resultado`,
        type: 'tool',
        tool_call_id: chamada.id,
        name: chamada.name,
        content: nuncaRodou ? NEVER_RAN : falhou ? (desfecho?.errorText ?? '') : '',
        status: falhou ? 'error' : 'success',
      },
    ];
  });
  return [mensagem, ...resultados];
}

/** A foto não é guardada (ADR 004); depois de recarregar, fica o aviso de que ela existiu. */
export const AVISO_DE_FOTO = '📷 Foto enviada — ela não fica guardada.';

/**
 * As linhas, em ordem cronológica, como mensagens do LangChain.
 *
 * Só fala de pessoa e de assistente com conteúdo: uma linha vazia viraria bolha
 * em branco. O desfecho de uma tool pode estar numa linha posterior à da chamada
 * (a escrita confirmada roda na retomada), então os desfechos são lidos da
 * conversa inteira antes.
 */
export function historyToMessages(linhas: readonly ChatHistoryMessage[]): LangChainMessage[] {
  const results = new Map<string, ToolResult>();
  for (const linha of linhas) {
    for (const desfecho of linha.metadata?.toolResults ?? []) results.set(desfecho.id, desfecho);
  }
  return linhas.flatMap((linha): LangChainMessage[] => {
    if (linha.role === 'user') {
      if (!linha.content) return [];
      const fotos = linha.metadata?.photos ?? 0;
      const content = fotos > 0 ? `${linha.content}\n\n${AVISO_DE_FOTO}` : linha.content;
      return [{ id: linha.id, type: 'human', content }];
    }
    return assistantMessages(linha, results);
  });
}

/** Os cartões das tools gravados na conversa, pelo `toolCallId`. */
export function artifactsFromHistory(
  linhas: readonly ChatHistoryMessage[],
): Record<string, ChatArtifact> {
  return Object.assign({}, ...linhas.map((linha) => linha.metadata?.artifacts ?? {}));
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

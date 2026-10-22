/**
 * A conversa do chat como estado puro: os quadros SSE do agente entram, a
 * conversa que a tela desenha sai (Fase 9e).
 *
 * A web não precisa disto — o `useLangGraphRuntime` do assistant-ui acumula o
 * vocabulário do LangGraph por ela. O app nativo não tem esse runtime, e
 * reimplementar a acumulação dentro de um componente a deixaria sem teste. Aqui
 * ela é função: `applyChatFrame(estado, quadro) → estado`, testável sem tela.
 *
 * O contrato do fio está em `apps/agent/src/fatia_agent/chat/events.py`:
 *
 * - `messages`: `[fragmento, metadados]` — texto e raciocínio acumulam por `id`;
 * - `updates`: mensagens inteiras por nó (a do assistente com `tool_calls`, a
 *   `ToolMessage` com o desfecho) e `__interrupt__`, a pausa;
 * - `messages/complete`: a resposta final, que substitui o que os fragmentos montaram;
 * - os próprios: `start`, `catalog`, `plan`, `artifact`, `error`, `done`, `persisted`.
 */

import type {
  ChatArtifact,
  ChatAskField,
  ChatHistoryMessage,
  ChatInterruptValue,
  ChatPlanStep,
  ChatQuestionAction,
  ChatStreamError,
  ChatStreamFrame,
} from './chat';
import { erroDoChat } from './chat';

/**
 * `refused` e `not_run` não são falha da tool: a pessoa recusou a escrita, ou a
 * conversa seguiu antes de ela rodar. A tela não os mostra como "não deu certo".
 */
export type ChatToolStatus = 'running' | 'success' | 'error' | 'refused' | 'not_run';

/**
 * Os desfechos que o próprio agente escreve (`RECUSADA` e `NAO_EXECUTADA` em
 * `apps/agent/.../chat/graph.py`), reconhecidos pelo começo do texto — é o que
 * atravessa o fio. Os mesmos prefixos do PWA (`components/chat/partes.tsx`), e
 * um teste lê o agente para o texto daqui não ficar para trás.
 */
export const TOOL_REFUSED_PREFIX = 'A pessoa recusou';
export const TOOL_NOT_RUN_PREFIX = 'Não executada';

/** O desfecho de uma chamada, a partir do que o agente gravou. */
function toolOutcome(erro: boolean, content: unknown): Pick<ChatToolPart, 'status' | 'errorText'> {
  if (!erro) return { status: 'success' };
  const texto = typeof content === 'string' ? content : '';
  if (texto.startsWith(TOOL_REFUSED_PREFIX)) return { status: 'refused' };
  if (texto.startsWith(TOOL_NOT_RUN_PREFIX)) return { status: 'not_run' };
  return { status: 'error', ...(texto ? { errorText: texto } : {}) };
}

export interface ChatToolPart {
  /** O `toolCallId`: é por ele que o desfecho e o cartão (`artifact`) se penduram. */
  id: string;
  name: string;
  status: ChatToolStatus;
  /** Só no erro: o que a tool disse, para a pessoa entender por que não deu. */
  errorText?: string;
}

export interface ChatUserMessage {
  role: 'user';
  id: string;
  text: string;
  /** Quantas fotos foram junto. A foto não fica guardada (ADR 004). */
  photos: number;
}

export interface ChatAssistantMessage {
  role: 'assistant';
  /** O id do LangChain enquanto a resposta chega; o da linha do banco depois de um F5. */
  id: string;
  text: string;
  reasoning: string;
  tools: ChatToolPart[];
  /** A linha do banco onde o voto grava (do `persisted`, ou o próprio id no histórico). */
  rowId?: string;
  /** A pessoa parou esta resposta no meio. */
  stopped?: boolean;
  review?: 'like' | 'dislike' | null;
  durationMs?: number;
}

export type ChatThreadMessage = ChatUserMessage | ChatAssistantMessage;

export interface ChatPendingInterrupt {
  id: string;
  value: ChatInterruptValue;
}

export interface ChatThreadState {
  messages: ChatThreadMessage[];
  /** A pausa que espera a pessoa. Responder é um turno de `resume` com este `id`. */
  interrupt: ChatPendingInterrupt | null;
  plan: ChatPlanStep[] | null;
  /** `toolCallId` → o cartão da tool. */
  artifacts: Record<string, ChatArtifact>;
  /** Nome técnico da tool → título em português (`catalog`). */
  toolTitles: Record<string, string>;
  /** Uma resposta está chegando. */
  running: boolean;
  /** O erro do último turno, até a próxima mensagem. */
  error: ChatStreamError | null;
  /** O id do último quadro recebido: o cursor da reconexão (`live?after=`). */
  lastSeq: number;
}

export const EMPTY_CHAT_THREAD: ChatThreadState = {
  messages: [],
  interrupt: null,
  plan: null,
  artifacts: {},
  toolTitles: {},
  running: false,
  error: null,
  lastSeq: 0,
};

/** O que vai quando a pessoa manda só a foto: o agente recusa mensagem vazia. */
export const PHOTO_ONLY_QUESTION = 'O que tem nesta foto?';

type WireMessage = {
  type?: unknown;
  id?: unknown;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
  status?: unknown;
  name?: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Texto e raciocínio de um `content`, que pode ser string ou lista de blocos. */
function splitContent(content: unknown): { text: string; reasoning: string } {
  if (typeof content === 'string') return { text: content, reasoning: '' };
  if (!Array.isArray(content)) return { text: '', reasoning: '' };
  let text = '';
  let reasoning = '';
  for (const bloco of content) {
    if (!isRecord(bloco)) continue;
    if (bloco.type === 'text' && typeof bloco.text === 'string') text += bloco.text;
    if (bloco.type === 'reasoning' && typeof bloco.reasoning === 'string') {
      reasoning += bloco.reasoning;
    }
  }
  return { text, reasoning };
}

function isAi(m: WireMessage): boolean {
  return m.type === 'ai' || m.type === 'AIMessageChunk';
}

function upsertAssistant(
  messages: ChatThreadMessage[],
  id: string,
  update: (atual: ChatAssistantMessage) => ChatAssistantMessage,
): ChatThreadMessage[] {
  const indice = messages.findIndex((m) => m.role === 'assistant' && m.id === id);
  if (indice === -1) {
    const nova: ChatAssistantMessage = {
      role: 'assistant',
      id,
      text: '',
      reasoning: '',
      tools: [],
    };
    return [...messages, update(nova)];
  }
  const copia = messages.slice();
  copia[indice] = update(messages[indice] as ChatAssistantMessage);
  return copia;
}

/** A mensagem inteira do assistente (`updates`, `messages/complete`): substitui, não soma. */
function applyWholeAi(messages: ChatThreadMessage[], m: WireMessage): ChatThreadMessage[] {
  if (typeof m.id !== 'string') return messages;
  const { text, reasoning } = splitContent(m.content);
  const chamadas = Array.isArray(m.tool_calls) ? m.tool_calls : [];
  return upsertAssistant(messages, m.id, (atual) => {
    const tools = chamadas.flatMap((c): ChatToolPart[] => {
      if (!isRecord(c) || typeof c.id !== 'string' || typeof c.name !== 'string') return [];
      const antes = atual.tools.find((t) => t.id === c.id);
      return [antes ?? { id: c.id, name: c.name, status: 'running' }];
    });
    return {
      ...atual,
      text,
      reasoning: reasoning || atual.reasoning,
      tools: tools.length ? tools : atual.tools,
    };
  });
}

/** O desfecho de uma tool, procurado em todas as respostas (a escrita confirmada roda na retomada). */
function applyToolResult(messages: ChatThreadMessage[], m: WireMessage): ChatThreadMessage[] {
  const id = m.tool_call_id;
  if (typeof id !== 'string') return messages;
  const erro = m.status === 'error';
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !msg.tools.some((t) => t.id === id)) return msg;
    return {
      ...msg,
      tools: msg.tools.map((t) =>
        t.id === id ? { id: t.id, name: t.name, ...toolOutcome(erro, m.content) } : t,
      ),
    };
  });
}

/** Aplica um quadro do SSE. Pura: devolve um estado novo. */
export function applyChatFrame(state: ChatThreadState, frame: ChatStreamFrame): ChatThreadState {
  const s = frame.id !== undefined ? { ...state, lastSeq: frame.id } : state;
  const data = frame.data;
  switch (frame.event) {
    case 'start':
      return { ...s, running: true, plan: null, error: null };
    case 'catalog':
      return isRecord(data) && isRecord(data.tools)
        ? { ...s, toolTitles: { ...s.toolTitles, ...(data.tools as Record<string, string>) } }
        : s;
    case 'messages': {
      const fragmento = Array.isArray(data) ? (data[0] as WireMessage) : null;
      if (!fragmento || typeof fragmento.id !== 'string' || !isAi(fragmento)) return s;
      const { text, reasoning } = splitContent(fragmento.content);
      if (!text && !reasoning) return s;
      return {
        ...s,
        running: true,
        messages: upsertAssistant(s.messages, fragmento.id, (atual) => ({
          ...atual,
          text: atual.text + text,
          reasoning: atual.reasoning + reasoning,
        })),
      };
    }
    case 'updates': {
      if (!isRecord(data)) return s;
      let messages = s.messages;
      let interrupt = s.interrupt;
      for (const [no, conteudo] of Object.entries(data)) {
        if (no === '__interrupt__' && Array.isArray(conteudo)) {
          const primeira = conteudo[0];
          if (isRecord(primeira) && isRecord(primeira.value)) {
            interrupt = {
              id: typeof primeira.id === 'string' ? primeira.id : '',
              value: primeira.value as unknown as ChatInterruptValue,
            };
          }
          continue;
        }
        const lista =
          isRecord(conteudo) && Array.isArray(conteudo.messages) ? conteudo.messages : [];
        for (const m of lista as WireMessage[]) {
          if (!isRecord(m)) continue;
          if (isAi(m)) messages = applyWholeAi(messages, m);
          else if (m.type === 'tool') messages = applyToolResult(messages, m);
        }
      }
      return { ...s, messages, interrupt };
    }
    case 'messages/complete': {
      const lista = Array.isArray(data) ? (data as WireMessage[]) : [];
      let messages = s.messages;
      for (const m of lista) if (isRecord(m) && isAi(m)) messages = applyWholeAi(messages, m);
      return { ...s, messages };
    }
    case 'plan':
      return isRecord(data) && Array.isArray(data.steps)
        ? { ...s, plan: data.steps as ChatPlanStep[] }
        : s;
    case 'artifact':
      return isRecord(data) && typeof data.toolCallId === 'string'
        ? {
            ...s,
            artifacts: { ...s.artifacts, [data.toolCallId]: data as unknown as ChatArtifact },
          }
        : s;
    case 'error':
      return { ...s, error: erroDoChat(data) };
    case 'done': {
      const status = isRecord(data) ? data.status : undefined;
      const duracao =
        isRecord(data) && typeof data.durationMs === 'number' ? data.durationMs : undefined;
      let messages = s.messages;
      const ultima = lastAssistant(messages);
      if (ultima && (status === 'stopped' || duracao !== undefined)) {
        messages = upsertAssistant(messages, ultima.id, (m) => ({
          ...m,
          ...(status === 'stopped' ? { stopped: true } : {}),
          ...(duracao !== undefined ? { durationMs: duracao } : {}),
        }));
      }
      // Tool que não recebeu desfecho num turno que terminou não está "rodando".
      if (status !== 'interrupted') {
        messages = messages.map((m) =>
          m.role === 'assistant' && m.tools.some((t) => t.status === 'running')
            ? {
                ...m,
                tools: m.tools.map((t) => (t.status === 'running' ? { ...t, status: 'error' } : t)),
              }
            : m,
        );
      }
      return {
        ...s,
        messages,
        running: false,
        interrupt: status === 'interrupted' ? s.interrupt : null,
      };
    }
    case 'persisted': {
      if (!isRecord(data) || typeof data.assistantMessageId !== 'string') return s;
      const rowId = data.assistantMessageId;
      const alvo =
        (typeof data.messageId === 'string' &&
          s.messages.find((m) => m.role === 'assistant' && m.id === data.messageId)) ||
        lastAssistant(s.messages);
      if (!alvo) return s;
      return { ...s, messages: upsertAssistant(s.messages, alvo.id, (m) => ({ ...m, rowId })) };
    }
    default:
      return s;
  }
}

function lastAssistant(messages: ChatThreadMessage[]): ChatAssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant') return m;
  }
  return undefined;
}

/** A pergunta da pessoa, já na tela antes de a resposta chegar. */
export function appendUserMessage(
  state: ChatThreadState,
  message: { id: string; text: string; photos?: number },
): ChatThreadState {
  return {
    ...state,
    error: null,
    running: true,
    interrupt: null,
    messages: [
      ...state.messages,
      { role: 'user', id: message.id, text: message.text, photos: message.photos ?? 0 },
    ],
  };
}

/** O que mudou de mãos depois de um F5: as linhas gravadas viram a conversa da tela. */
export function threadFromHistory(rows: readonly ChatHistoryMessage[]): ChatThreadState {
  const desfechos = new Map<string, { status: 'success' | 'error'; errorText?: string }>();
  for (const row of rows) {
    for (const r of row.metadata?.toolResults ?? []) desfechos.set(r.id, r);
  }
  const messages: ChatThreadMessage[] = [];
  let artifacts: Record<string, ChatArtifact> = {};
  for (const row of rows) {
    if (row.role === 'user') {
      if (row.content) {
        messages.push({
          role: 'user',
          id: row.id,
          text: row.content,
          photos: row.metadata?.photos ?? 0,
        });
      }
      continue;
    }
    const chamadas = row.metadata?.toolCalls?.length
      ? row.metadata.toolCalls
      : (row.tools ?? []).map((t, i) => ({ id: `${row.id}:${i}`, name: t.name }));
    const aberta = row.metadata?.status === 'interrupted';
    const tools = chamadas.map((c): ChatToolPart => {
      const d = desfechos.get(c.id);
      if (d) return { id: c.id, name: c.name, ...toolOutcome(d.status === 'error', d.errorText) };
      // Sem desfecho: espera a pausa (aberta) ou nunca rodou — não é "feito".
      return { id: c.id, name: c.name, status: aberta ? 'running' : 'not_run' };
    });
    if (!row.content && tools.length === 0) continue;
    artifacts = { ...artifacts, ...(row.metadata?.artifacts ?? {}) };
    messages.push({
      role: 'assistant',
      id: row.id,
      rowId: row.id,
      text: row.content,
      reasoning: '',
      tools,
      review: row.review,
      ...(row.metadata?.status === 'stopped' ? { stopped: true } : {}),
      ...(typeof row.metadata?.durationMs === 'number'
        ? { durationMs: row.metadata.durationMs }
        : {}),
    });
  }
  const ultima = rows.at(-1);
  const pausa =
    ultima?.role === 'assistant' &&
    ultima.metadata?.status === 'interrupted' &&
    ultima.metadata.interrupt?.value
      ? { id: ultima.metadata.interrupt.id, value: ultima.metadata.interrupt.value }
      : null;
  return { ...EMPTY_CHAT_THREAD, messages, artifacts, interrupt: pausa };
}

// ------------------------------------------------------- as perguntas do agente

const TIPOS: ChatAskField['type'][] = ['text', 'number', 'date', 'select', 'boolean'];

/**
 * Os campos como o formulário precisa deles.
 *
 * ⚠️ Quem escreve `fields` é o **modelo**, e ele não respeita o contrato à risca:
 * manda campo sem `label`, sem `type`, ou só o nome em texto. O agente já
 * normaliza (`human.pergunta_dos_argumentos`), e esta é a segunda barreira: um
 * campo malformado não pode derrubar a tela da conversa.
 */
export function normalizeAskFields(bruto: unknown): ChatAskField[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item, indice): ChatAskField[] => {
    if (typeof item === 'string') {
      return item.trim() ? [{ name: `campo_${indice}`, label: item.trim(), type: 'text' }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const campo = item as Partial<ChatAskField>;
    const label = String(campo.label || campo.name || '').trim();
    if (!label) return [];
    return [
      {
        name: String(campo.name || `campo_${indice}`),
        label,
        type: TIPOS.includes(campo.type as ChatAskField['type'])
          ? (campo.type as ChatAskField['type'])
          : 'text',
        required: campo.required === true,
        ...(Array.isArray(campo.options) ? { options: campo.options.map(String) } : {}),
      },
    ];
  });
}

/** Os campos da pergunta; sem nenhum aproveitável, uma resposta livre. */
export function askFieldsOf(acao: ChatQuestionAction): ChatAskField[] {
  const campos = normalizeAskFields(acao.fields);
  return campos.length > 0 ? campos : [{ name: '__livre', label: 'Sua resposta', type: 'text' }];
}

/** O que vai no `answers` para uma pergunta: o texto livre, ou rótulo → valor. */
export function questionAnswer(campos: ChatAskField[], valores: Record<string, string>): unknown {
  if (campos.length === 1 && campos[0].name === '__livre') return valores.__livre ?? '';
  return Object.fromEntries(
    campos.filter((c) => (valores[c.name] ?? '') !== '').map((c) => [c.label, valores[c.name]]),
  );
}

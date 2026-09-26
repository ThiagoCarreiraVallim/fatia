import { type EventoSse, dadosDoEvento, jsonDoEvento } from './sse';

/**
 * O que a API precisa entender de um turno que passou por ela — e só isso.
 *
 * O fluxo é o vocabulário nativo do LangGraph (ADR 023): texto em `messages`,
 * pedidos de tool e pausas em `updates`, a resposta final em
 * `messages/complete`. Os bytes vão para o cliente **antes** de chegar aqui (ver
 * `ChatService`); este leitor só colhe o que alimenta três coisas:
 *
 * - a linha de `Message` que a tela mostra depois de um F5 (texto, tools, pausa);
 * - o livro-caixa da cota (`usage`, somado por modelo);
 * - o `persisted`, que liga o id da mensagem na tela à linha do banco.
 *
 * Quadro que não se reconhece é ignorado: os bytes já foram, e derrubar o turno
 * trocaria "uma linha que a API não entendeu" por "a conversa sumiu".
 */

/** Unidades acumuladas de **um** modelo dentro de um turno. */
export type UnidadesDoModelo = { inputUnits?: number; outputUnits?: number };

/**
 * `stopped` nunca vem do agente: é o `ChatService` que o decide, quando a pessoa
 * parou a resposta (o cliente foi embora antes do `done`). Sem ele, um "parar"
 * era gravado como `error`, e a tela, depois de um F5, dizia que algo tinha dado
 * errado numa resposta que a própria pessoa interrompeu.
 */
export type TurnStatus = 'completed' | 'interrupted' | 'error' | 'stopped';

export type PausaDoTurno = { id: string; value: unknown };

/** Uma chamada de tool pedida neste turno: o id que a liga ao resultado, e o nome. */
export type ToolCallRecord = { id: string; name: string };

/**
 * O desfecho de uma tool, sem o resultado em si. O resultado carrega dado de
 * saúde que já está no domínio de destino; o que a tela precisa depois de um F5
 * é saber se deu certo — e, quando não deu, por quê (curto).
 *
 * Pode ser de uma chamada de um turno **anterior**: a escrita confirmada roda na
 * retomada, e o resultado dela chega no turno seguinte ao do pedido.
 */
export type ToolResultRecord = { id: string; status: 'success' | 'error'; errorText?: string };

/** Teto do motivo de falha gravado — é aviso de tela, não log. */
export const MAX_TOOL_ERROR_TEXT = 300;

/**
 * Teto de um artefato gravado, em caracteres do JSON. Acima disso ele não é
 * gravado (a tela volta sem o cartão, com o texto da resposta intacto): uma
 * tabela de 90 refeições não pode inflar cada linha de `Message`.
 */
export const MAX_ARTIFACT_JSON = 32_000;

export type TurnSummary = {
  /** O texto das respostas do assistente neste turno, na ordem. */
  texto: string;
  /** Tools pedidas, sem repetir nome, na ordem. Só o nome — ver `Message.tools`. */
  tools: { name: string }[];
  toolCalls: ToolCallRecord[];
  toolResults: ToolResultRecord[];
  /** `toolCallId` → a carga tipada que a tela desenha (`artifact`), já normalizada pelo agente. */
  artifacts: Record<string, Record<string, unknown>>;
  usoPorModelo: Map<string, UnidadesDoModelo>;
  status: TurnStatus;
  pausa: PausaDoTurno | null;
  /** O id da última mensagem do assistente, como a tela a conhece. */
  ultimaMensagemId: string | null;
  runId: string | null;
  /** Quanto o turno demorou, pelo relógio do agente. Ausente sem `done` do agente. */
  durationMs?: number;
  /** Até o primeiro caractere visível. Ausente quando nada chegou a aparecer. */
  ttftMs?: number;
  /** O agente mandou `done`: o turno terminou do lado dele, qualquer que seja o status. */
  sawDone: boolean;
};

/**
 * Soma em que `undefined` **contamina o total**, de propósito.
 *
 * Se qualquer chamada do turno deixou de reportar uma unidade, o total daquele
 * campo é desconhecido — e não a soma das que vieram. Somar só as presentes
 * devolveria um número menor que o real **com cara de medido**, e a cota
 * fecharia tarde. Com `undefined`, o turno cai em custo não medido (#135).
 */
function somarUnidade(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : a + b;
}

const numeroOuIndefinido = (valor: unknown): number | undefined =>
  typeof valor === 'number' ? valor : undefined;

/** Medida de tempo que faz sentido gravar: inteiro, não negativo. O resto vira ausência. */
const asMilliseconds = (valor: unknown): number | undefined =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : undefined;

const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;

const textoDe = (conteudo: unknown): string => {
  if (typeof conteudo === 'string') return conteudo;
  if (!Array.isArray(conteudo)) return '';
  return conteudo
    .map((bloco) => {
      const b = objeto(bloco);
      return b && b.type === 'text' && typeof b.text === 'string' ? b.text : '';
    })
    .join('');
};

const eDoAssistente = (mensagem: Record<string, unknown>): boolean =>
  mensagem.type === 'ai' || mensagem.type === 'AIMessageChunk';

export function createTurnReader() {
  /** Texto por id de mensagem, na ordem em que cada id apareceu. */
  const textos = new Map<string, string>();
  const tools: { name: string }[] = [];
  const toolCalls: ToolCallRecord[] = [];
  const toolResults = new Map<string, ToolResultRecord>();
  const artifacts: Record<string, Record<string, unknown>> = {};
  const usoPorModelo = new Map<string, UnidadesDoModelo>();
  let status: TurnStatus = 'error';
  let pausa: PausaDoTurno | null = null;
  let runId: string | null = null;
  let durationMs: number | undefined;
  let ttftMs: number | undefined;
  let sawDone = false;

  function mensagemInteira(mensagem: Record<string, unknown>) {
    if (!eDoAssistente(mensagem) || typeof mensagem.id !== 'string') return;
    // Sem `content` no quadro não é "texto vazio": o agente tira do fio o campo
    // vazio, e a mensagem que só pede tool chega assim. Zerar aqui apagaria o
    // texto que os fragmentos já trouxeram.
    if ('content' in mensagem) textos.set(mensagem.id, textoDe(mensagem.content));
    else if (!textos.has(mensagem.id)) textos.set(mensagem.id, '');
    const chamadas = Array.isArray(mensagem.tool_calls) ? mensagem.tool_calls : [];
    for (const chamada of chamadas) {
      const nome = objeto(chamada)?.name;
      if (typeof nome === 'string' && !tools.some((t) => t.name === nome)) {
        tools.push({ name: nome });
      }
      const id = objeto(chamada)?.id;
      if (
        typeof nome === 'string' &&
        typeof id === 'string' &&
        !toolCalls.some((t) => t.id === id)
      ) {
        toolCalls.push({ id, name: nome });
      }
    }
  }

  function toolResult(mensagem: Record<string, unknown>) {
    const id = mensagem.tool_call_id;
    if (typeof id !== 'string') return;
    const erro = mensagem.status === 'error';
    const texto = textoDe(mensagem.content).trim();
    toolResults.set(id, {
      id,
      status: erro ? 'error' : 'success',
      ...(erro && texto ? { errorText: texto.slice(0, MAX_TOOL_ERROR_TEXT) } : {}),
    });
  }

  return {
    absorb(evento: EventoSse): void {
      switch (evento.event) {
        case 'start': {
          const dados = dadosDoEvento(evento);
          if (typeof dados?.runId === 'string') runId = dados.runId;
          return;
        }
        case 'messages': {
          const dados = jsonDoEvento(evento);
          const mensagem = Array.isArray(dados) ? objeto(dados[0]) : null;
          if (!mensagem || !eDoAssistente(mensagem) || typeof mensagem.id !== 'string') return;
          textos.set(mensagem.id, (textos.get(mensagem.id) ?? '') + textoDe(mensagem.content));
          return;
        }
        case 'updates': {
          const dados = dadosDoEvento(evento);
          if (!dados) return;
          for (const [no, conteudo] of Object.entries(dados)) {
            if (no === '__interrupt__') {
              const primeira = Array.isArray(conteudo) ? objeto(conteudo[0]) : null;
              if (primeira && typeof primeira.id === 'string') {
                pausa = { id: primeira.id, value: primeira.value };
              }
              continue;
            }
            const mensagens = objeto(conteudo)?.messages;
            if (!Array.isArray(mensagens)) continue;
            for (const bruta of mensagens) {
              const mensagem = objeto(bruta);
              if (!mensagem) continue;
              if (mensagem.type === 'tool') toolResult(mensagem);
              else mensagemInteira(mensagem);
            }
          }
          return;
        }
        case 'messages/complete': {
          const dados = jsonDoEvento(evento);
          for (const bruta of Array.isArray(dados) ? dados : []) {
            const mensagem = objeto(bruta);
            if (mensagem) mensagemInteira(mensagem);
          }
          return;
        }
        case 'artifact': {
          const dados = dadosDoEvento(evento);
          if (!dados || typeof dados.toolCallId !== 'string' || typeof dados.kind !== 'string') {
            return;
          }
          if (JSON.stringify(dados).length > MAX_ARTIFACT_JSON) return;
          artifacts[dados.toolCallId] = dados;
          return;
        }
        case 'usage': {
          const dados = dadosDoEvento(evento);
          if (typeof dados?.model !== 'string') return;
          const acumulado = usoPorModelo.get(dados.model) ?? { inputUnits: 0, outputUnits: 0 };
          usoPorModelo.set(dados.model, {
            inputUnits: somarUnidade(acumulado.inputUnits, numeroOuIndefinido(dados.inputUnits)),
            outputUnits: somarUnidade(acumulado.outputUnits, numeroOuIndefinido(dados.outputUnits)),
          });
          return;
        }
        case 'done': {
          sawDone = true;
          const dados = dadosDoEvento(evento);
          const valor = dados?.status;
          if (valor === 'completed' || valor === 'interrupted' || valor === 'error') status = valor;
          durationMs = asMilliseconds(dados?.durationMs);
          ttftMs = asMilliseconds(dados?.ttftMs);
          return;
        }
        default:
          return;
      }
    },

    read(): TurnSummary {
      const ids = [...textos.keys()];
      return {
        texto: [...textos.values()].filter((t) => t.trim() !== '').join('\n\n'),
        tools: [...tools],
        toolCalls: [...toolCalls],
        toolResults: [...toolResults.values()],
        artifacts: { ...artifacts },
        usoPorModelo,
        status,
        pausa: status === 'interrupted' ? pausa : null,
        ultimaMensagemId: ids.at(-1) ?? null,
        runId,
        sawDone,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(ttftMs !== undefined ? { ttftMs } : {}),
      };
    },
  };
}

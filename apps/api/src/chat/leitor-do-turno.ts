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

export type StatusDoTurno = 'completed' | 'interrupted' | 'error';

export type PausaDoTurno = { id: string; value: unknown };

export type TurnoLido = {
  /** O texto das respostas do assistente neste turno, na ordem. */
  texto: string;
  /** Tools pedidas, sem repetir nome, na ordem. Só o nome — ver `Message.tools`. */
  tools: { name: string }[];
  usoPorModelo: Map<string, UnidadesDoModelo>;
  status: StatusDoTurno;
  pausa: PausaDoTurno | null;
  /** O id da última mensagem do assistente, como a tela a conhece. */
  ultimaMensagemId: string | null;
  runId: string | null;
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

export function criarLeitorDoTurno() {
  /** Texto por id de mensagem, na ordem em que cada id apareceu. */
  const textos = new Map<string, string>();
  const tools: { name: string }[] = [];
  const usoPorModelo = new Map<string, UnidadesDoModelo>();
  let status: StatusDoTurno = 'error';
  let pausa: PausaDoTurno | null = null;
  let runId: string | null = null;

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
    }
  }

  return {
    absorver(evento: EventoSse): void {
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
              if (mensagem) mensagemInteira(mensagem);
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
          const valor = dadosDoEvento(evento)?.status;
          if (valor === 'completed' || valor === 'interrupted' || valor === 'error') status = valor;
          return;
        }
        default:
          return;
      }
    },

    lido(): TurnoLido {
      const ids = [...textos.keys()];
      return {
        texto: [...textos.values()].filter((t) => t.trim() !== '').join('\n\n'),
        tools: [...tools],
        usoPorModelo,
        status,
        pausa: status === 'interrupted' ? pausa : null,
        ultimaMensagemId: ids.at(-1) ?? null,
        runId,
      };
    },
  };
}

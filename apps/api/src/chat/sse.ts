/**
 * Leitura incremental de SSE, para o proxy de chat (#249).
 *
 * O NestJS repassa os bytes do agente **sem bufferizar** — o que sai daqui não é
 * o que vai para o cliente, é o que a API precisa entender do que passou: o texto
 * a persistir, quais tools foram chamadas e o `usage` que alimenta a cota.
 *
 * Por que um leitor incremental e não um `split` no fim: um chunk de rede não
 * respeita fronteira de evento. `event: token\ndata: {"text":"o` chega num chunk
 * e `i"}\n\n` no seguinte, e qualquer parser que assuma "um chunk = um evento"
 * perde a mensagem inteira em produção com teste verde — porque no teste o chunk
 * sempre chega inteiro. Este leitor guarda o resto entre chamadas.
 */

export type EventoSse = {
  /** `message` quando o produtor não mandou `event:`, como manda a especificação. */
  event: string;
  /** Linhas `data:` juntadas por `\n`, sem o prefixo. */
  data: string;
};

export interface LeitorSse {
  /** Consome um pedaço do corpo e devolve os eventos que fecharam nele. */
  push(pedaco: Uint8Array): EventoSse[];
}

export function criarLeitorSse(): LeitorSse {
  const decoder = new TextDecoder();
  let resto = '';
  let evento = '';
  const dados: string[] = [];

  function fechar(): EventoSse | null {
    if (dados.length === 0 && evento === '') return null;
    const pronto: EventoSse = { event: evento || 'message', data: dados.join('\n') };
    evento = '';
    dados.length = 0;
    return pronto;
  }

  return {
    push(pedaco: Uint8Array): EventoSse[] {
      // `stream: true` para que um caractere multibyte partido entre dois chunks
      // não vire `` — acentuação é a regra no português deste produto, não a
      // exceção.
      resto += decoder.decode(pedaco, { stream: true });

      const prontos: EventoSse[] = [];
      let quebra = resto.indexOf('\n');
      while (quebra !== -1) {
        // `\r\n` é legal em SSE e o `\r` sobraria dentro do JSON do `data`.
        const linha = resto.slice(0, quebra).replace(/\r$/, '');
        resto = resto.slice(quebra + 1);
        quebra = resto.indexOf('\n');

        if (linha === '') {
          const pronto = fechar();
          if (pronto) prontos.push(pronto);
          continue;
        }
        // Comentário/heartbeat. O agente pode mandar `:keep-alive` para o proxy
        // reverso não fechar a conexão ociosa.
        if (linha.startsWith(':')) continue;

        const doisPontos = linha.indexOf(':');
        const campo = doisPontos === -1 ? linha : linha.slice(0, doisPontos);
        // Um único espaço depois dos dois-pontos é separador, não conteúdo.
        const valor = doisPontos === -1 ? '' : linha.slice(doisPontos + 1).replace(/^ /, '');

        if (campo === 'event') evento = valor;
        else if (campo === 'data') dados.push(valor);
        // `id` e `retry` não têm uso aqui: não há reconexão com Last-Event-ID —
        // um turno interrompido é retomado mandando a mensagem de novo, com o
        // histórico que o banco guarda.
      }
      return prontos;
    },
  };
}

/**
 * `data` como objeto, ou `null` quando não é JSON.
 *
 * Evento malformado é ignorado em vez de derrubar o turno: os bytes já foram
 * para o cliente de qualquer jeito, e abortar aqui trocaria "uma linha que a API
 * não entendeu" por "a conversa inteira sumiu".
 */
export function dadosDoEvento(evento: EventoSse): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(evento.data);
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Serializa um evento nosso para o cliente. Usado só pelo que a API acrescenta. */
export function formatarEventoSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

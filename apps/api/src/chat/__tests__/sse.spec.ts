import { criarLeitorSse, dadosDoEvento, formatarEventoSse, type EventoSse } from '../sse';

/**
 * O leitor de SSE do proxy de chat (#249).
 *
 * O caso que este arquivo existe para cobrir é o do chunk partido. Um teste que
 * empurra sempre o evento inteiro passa verde sobre um parser que só funciona
 * quando a rede colabora — e a rede não colabora: em produção o corte cai no meio
 * do JSON, no meio da palavra e até no meio de um caractere acentuado.
 */

const enc = (texto: string) => new TextEncoder().encode(texto);

/** Empurra a string byte a byte — o pior caso de fragmentação possível. */
function lerByteAByte(texto: string): EventoSse[] {
  const leitor = criarLeitorSse();
  const bytes = enc(texto);
  const eventos: EventoSse[] = [];
  for (const byte of bytes) {
    eventos.push(...leitor.push(new Uint8Array([byte])));
  }
  return eventos;
}

describe('criarLeitorSse', () => {
  it('lê um evento inteiro num chunk só', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: token\ndata: {"text":"oi"}\n\n'))).toEqual([
      { event: 'token', data: '{"text":"oi"}' },
    ]);
  });

  it('não devolve nada enquanto o evento não fechou', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: token\ndata: {"text":"oi"}\n'))).toEqual([]);
    expect(leitor.push(enc('\n'))).toEqual([{ event: 'token', data: '{"text":"oi"}' }]);
  });

  it('junta um evento partido entre chunks', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: tok'))).toEqual([]);
    expect(leitor.push(enc('en\ndata: {"te'))).toEqual([]);
    expect(leitor.push(enc('xt":"oi"}\n\n'))).toEqual([{ event: 'token', data: '{"text":"oi"}' }]);
  });

  it('sobrevive à fragmentação byte a byte, com acento', () => {
    // Um `ç` são dois bytes em UTF-8. Sem `decode(..., { stream: true })` o corte
    // no meio dele vira ``, e o `JSON.parse` do turno inteiro falha.
    const eventos = lerByteAByte('event: token\ndata: {"text":"refeição"}\n\n');
    expect(eventos).toEqual([{ event: 'token', data: '{"text":"refeição"}' }]);
    expect(dadosDoEvento(eventos[0])).toEqual({ text: 'refeição' });
  });

  it('devolve vários eventos que chegaram no mesmo chunk', () => {
    const leitor = criarLeitorSse();
    const eventos = leitor.push(
      enc('event: token\ndata: {"text":"a"}\n\nevent: token\ndata: {"text":"b"}\n\n'),
    );
    expect(eventos.map((e) => e.data)).toEqual(['{"text":"a"}', '{"text":"b"}']);
  });

  it('junta linhas `data` múltiplas com quebra de linha', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: token\ndata: linha 1\ndata: linha 2\n\n'))).toEqual([
      { event: 'token', data: 'linha 1\nlinha 2' },
    ]);
  });

  it('aceita CRLF sem deixar o `\\r` dentro do dado', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: token\r\ndata: {"text":"oi"}\r\n\r\n'))).toEqual([
      { event: 'token', data: '{"text":"oi"}' },
    ]);
  });

  it('ignora comentário de keep-alive', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc(': keep-alive\n\nevent: done\ndata: {}\n\n'))).toEqual([
      { event: 'done', data: '{}' },
    ]);
  });

  it('evento sem `event:` é `message`, como manda a especificação', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('data: {"text":"oi"}\n\n'))).toEqual([
      { event: 'message', data: '{"text":"oi"}' },
    ]);
  });

  it('preserva espaço interno do dado e come só o separador', () => {
    const leitor = criarLeitorSse();
    expect(leitor.push(enc('event: token\ndata:  dois espaços \n\n'))).toEqual([
      { event: 'token', data: ' dois espaços ' },
    ]);
  });
});

describe('dadosDoEvento', () => {
  it('devolve null para dado que não é JSON de objeto', () => {
    expect(dadosDoEvento({ event: 'token', data: 'texto solto' })).toBeNull();
    expect(dadosDoEvento({ event: 'token', data: '[1,2]' })).toBeNull();
    expect(dadosDoEvento({ event: 'token', data: '' })).toBeNull();
  });
});

describe('formatarEventoSse', () => {
  it('fecha o evento com a linha em branco', () => {
    expect(formatarEventoSse('conversation', { conversationId: 'c1' })).toBe(
      'event: conversation\ndata: {"conversationId":"c1"}\n\n',
    );
  });
});

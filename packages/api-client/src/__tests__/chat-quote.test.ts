import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX, CHAT_QUOTE_MAX, splitQuote, withQuote } from '../chat-quote';

describe('citação na mensagem do chat', () => {
  it('põe o trecho como bloco `> ` antes da pergunta, linha por linha', () => {
    expect(withQuote('Frango: 31 g de proteína\n\n\nArroz: 2,5 g', 'e o feijão?')).toBe(
      '> Frango: 31 g de proteína\n> Arroz: 2,5 g\n\ne o feijão?',
    );
  });

  it('sem trecho, a mensagem fica como está', () => {
    expect(withQuote(undefined, ' oi ')).toBe('oi');
    expect(withQuote('   ', 'oi')).toBe('oi');
  });

  it('trecho longo é cortado com reticências, e a pergunta fica inteira', () => {
    const msg = withQuote('a'.repeat(5_000), 'resume isso');
    const { quote, text } = splitQuote(msg);
    expect(text).toBe('resume isso');
    expect(quote).toHaveLength(CHAT_QUOTE_MAX);
    expect(quote?.endsWith('…')).toBe(true);
  });

  it('a mensagem com citação nunca passa do teto da API', () => {
    const pergunta = 'p'.repeat(CHAT_MESSAGE_MAX - 100);
    const msg = withQuote('trecho '.repeat(200), pergunta);
    expect(msg.length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX);
    expect(msg.endsWith(pergunta)).toBe(true);
  });

  it('sem espaço para a citação, ela sai e a pergunta vai sozinha', () => {
    const pergunta = 'p'.repeat(CHAT_MESSAGE_MAX - 5);
    expect(withQuote('um trecho qualquer', pergunta)).toBe(pergunta);
  });

  it('separa a citação do texto, ida e volta', () => {
    const msg = withQuote('linha 1\nlinha 2', 'por quê?');
    expect(splitQuote(msg)).toEqual({ quote: 'linha 1\nlinha 2', text: 'por quê?' });
  });

  it('mensagem sem citação passa intacta', () => {
    expect(splitQuote('bom dia\n> não é citação')).toEqual({
      quote: null,
      text: 'bom dia\n> não é citação',
    });
  });
});

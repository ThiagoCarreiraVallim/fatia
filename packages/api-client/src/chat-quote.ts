/**
 * Citar um trecho de uma resposta na pergunta seguinte.
 *
 * A citação viaja **dentro do texto**, como um bloco `> ` no começo da mensagem,
 * e não em metadado: a conversão do assistant-ui para o LangChain descarta o
 * metadado da mensagem, e no texto ela chega ao modelo, fica gravada com a
 * mensagem e volta igual ao reabrir a conversa. A tela reconhece o bloco
 * (`splitQuote`) e o desenha como citação.
 */

/** O teto da mensagem na API (`chat.dto.ts`). A citação nunca o estoura. */
export const CHAT_MESSAGE_MAX = 4_000;
/** Até aqui um trecho é contexto; passando disso, é a resposta inteira de volta. */
export const CHAT_QUOTE_MAX = 600;

const MARCA = '> ';

/**
 * A mensagem com a citação na frente. O trecho é cortado (com `…`) para caber no
 * teto da citação e no que sobra da mensagem; o texto da pessoa nunca é cortado.
 */
export function withQuote(quote: string | null | undefined, text: string): string {
  const pergunta = text.trim();
  const trecho = (quote ?? '').trim().replace(/\n{2,}/g, '\n');
  if (!trecho) return pergunta;

  const linhas = trecho.split('\n').length;
  // O que a citação ocupa além do trecho: a marca de cada linha e a linha em branco.
  const sobra = CHAT_MESSAGE_MAX - pergunta.length - 2 - linhas * MARCA.length;
  const teto = Math.min(CHAT_QUOTE_MAX, sobra);
  if (teto < 20) return pergunta;

  const cortado = trecho.length > teto ? `${trecho.slice(0, teto - 1).trimEnd()}…` : trecho;
  const bloco = cortado
    .split('\n')
    .map((linha) => `${MARCA}${linha}`)
    .join('\n');
  return pergunta ? `${bloco}\n\n${pergunta}` : bloco;
}

/** Separa a citação do começo da mensagem, para desenhá-la à parte. */
export function splitQuote(text: string): { quote: string | null; text: string } {
  const linhas = text.split('\n');
  let i = 0;
  while (i < linhas.length && linhas[i].startsWith('>')) i++;
  if (i === 0) return { quote: null, text };
  const quote = linhas
    .slice(0, i)
    .map((linha) => linha.replace(/^> ?/, ''))
    .join('\n')
    .trim();
  return { quote: quote || null, text: linhas.slice(i).join('\n').trim() };
}

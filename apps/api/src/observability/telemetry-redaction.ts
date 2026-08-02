import type { Attributes } from '@opentelemetry/api';

/**
 * Saneamento de atributo de span.
 *
 * Por que isto existe: o Fatia trata **dado de saúde** — categoria especial na LGPD (art. 11).
 * O comportamento pronto de fábrica do OpenTelemetry é errado para este produto: a
 * instrumentação de HTTP preenche `url.query` com a query string **crua** de toda requisição
 * de entrada. Uma busca de alimento (`?search=whey`), um filtro por data ou um token que
 * alguém colocou na URL por engano viram atributo de span e vão parar no Tempo, que não tem
 * nem consentimento nem política de retenção para isso.
 *
 * A regra é a mesma que o `docs/THREAT_MODEL.md` §"Vazamento por log" já aplica aos logs de
 * tool: registra-se **a forma** da operação (rota, método, status, duração), nunca o
 * **conteúdo** dela.
 *
 * Este módulo é o único ponto de saneamento e é aplicado pelo `RedactingSpanProcessor`, antes
 * do exportador. Instrumentação nova que passe a preencher atributo sensível precisa entrar
 * aqui — e o teste `telemetry-redaction.spec.ts` falha se a lista deixar de cobrir os casos.
 */

/** Marcador visível no backend: o campo existiu e foi removido de propósito, não sumiu por bug. */
export const REDACTED_VALUE = '[redigido]';

/**
 * Atributos removidos por inteiro. Não há versão saneada útil deles.
 *
 * - `url.query`: conteúdo cru enviado pelo usuário.
 * - `db.statement` / `db.query.text`: preenchidos por instrumentação de banco (nenhuma está
 *   ligada hoje, mas a lista precisa ser à prova de quem ligar amanhã) e carregam os valores
 *   literais da query.
 * - `client.address` / `network.peer.address`: IP é dado pessoal. Em produção a API fica atrás
 *   do Traefik, então o valor é o endereço do proxy — risco sem nenhum ganho diagnóstico.
 */
export const DROPPED_SPAN_ATTRIBUTE_KEYS: readonly string[] = [
  'url.query',
  'db.statement',
  'db.query.text',
  'client.address',
  'network.peer.address',
];

/** Atributos de URL: mantemos o caminho, cortamos a query. */
export const URL_SPAN_ATTRIBUTE_KEYS: readonly string[] = ['url.full', 'http.url', 'http.target'];

/**
 * Cabeçalhos só entram em span se alguém configurar `headersToSpanAttributes` — não é o default.
 * A remoção por prefixo existe para o dia em que alguém configurar "só para depurar" e esquecer:
 * `Authorization` e `Cookie` carregam o token de acesso inteiro.
 */
export const DROPPED_SPAN_ATTRIBUTE_PREFIXES: readonly string[] = [
  'http.request.header.',
  'http.response.header.',
];

/** Rede final: um e-mail em qualquer atributo identifica a pessoa, venha de onde vier. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Remove a query string mantendo esquema, host e caminho. Não usa `URL` para tolerar valor relativo. */
export function stripQueryString(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/**
 * Sanea **no lugar**. Muta de propósito: o `ReadableSpan` entregue ao processador é o mesmo
 * objeto que segue para o exportador, e copiá-lo perderia os métodos do protótipo
 * (`spanContext()`), quebrando o exportador.
 */
export function redactSpanAttributes(attributes: Attributes): void {
  for (const key of Object.keys(attributes)) {
    if (DROPPED_SPAN_ATTRIBUTE_KEYS.includes(key)) {
      delete attributes[key];
      continue;
    }

    if (DROPPED_SPAN_ATTRIBUTE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      delete attributes[key];
      continue;
    }

    const value = attributes[key];
    if (typeof value !== 'string') continue;

    if (URL_SPAN_ATTRIBUTE_KEYS.includes(key)) {
      attributes[key] = stripQueryString(value);
      continue;
    }

    if (EMAIL_PATTERN.test(value)) {
      attributes[key] = REDACTED_VALUE;
    }
  }
}

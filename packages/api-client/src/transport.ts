/**
 * Contrato de transporte do cliente de API.
 *
 * O pacote sabe **quais** rotas existem e qual o formato das respostas. Ele não
 * sabe — e não pode saber — como o token chega até a requisição, porque isso é
 * radicalmente diferente nos dois consumidores:
 *
 * - **web**: o token nunca chega ao navegador. A chamada vai para o proxy do
 *   Next (`/api/proxy/...`), que injeta o `Authorization` no servidor a partir
 *   do cookie de sessão.
 * - **mobile**: não existe servidor. A chamada vai direto para a API pública com
 *   um `Bearer` lido do armazenamento seguro do sistema.
 *
 * Cada app implementa esta interface uma vez. Nada específico de um transporte
 * (o rewrite do proxy, o tratamento de `204`/`304` do handler do Next) sobe para
 * cá — é justamente o que a issue #119 pede para não vazar.
 */
export interface ApiTransport {
  /**
   * Converte o caminho lógico (`/api/nutrition/summary?date=…`) na URL que este
   * app realmente chama. O web reescreve para o proxy; o mobile prefixa com o
   * host da API.
   */
  resolveUrl(path: string): string;

  /**
   * Cabeçalhos a somar em cada requisição. É aqui que o mobile devolve o
   * `Authorization`. Pode ser assíncrono porque obter o token pode disparar um
   * refresh.
   */
  headers?(path: string): HeadersInit | undefined | Promise<HeadersInit | undefined>;

  /** Opções extras de `fetch` — o web usa para `credentials: 'include'`. */
  requestInit?(): RequestInit | undefined;

  /** `fetch` a usar. Existe para teste e para ambientes com fetch customizado. */
  fetch?: typeof fetch;

  /**
   * Chamado quando a API responde 401, antes do erro ser lançado. O web apenas
   * registra diagnóstico; o mobile derruba a sessão e manda para o login.
   */
  onUnauthorized?(context: { path: string; body: unknown }): void | Promise<void>;

  /** Tempo máximo por requisição. Padrão: 15 s. */
  timeoutMs?: number;
}

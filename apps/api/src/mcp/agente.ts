import { timingSafeEqual } from 'node:crypto';

/**
 * O header com que o agente da Fatia se apresenta ao `/mcp`. É o mesmo segredo que
 * a API já manda ao agente (`AGENT_API_KEY`, `http-agent.adapter.ts`), agora no
 * sentido contrário.
 *
 * Ele **não autentica ninguém** — quem a pessoa é continua vindo do Bearer, e é
 * por ele que toda tool amarra o `userId`. O header só decide se as tools
 * `agentOnly` entram no catálogo daquela requisição.
 */
export const HEADER_DO_AGENTE = 'x-fatia-agent-key';

/**
 * `true` só com a chave configurada **e** igual, em tempo constante. Chave vazia
 * na instância é "não há agente", e não "qualquer valor serve".
 */
export function ehOAgente(valor: string | string[] | undefined, chave: string): boolean {
  const esperada = chave.trim();
  if (!esperada || typeof valor !== 'string') return false;
  const a = Buffer.from(valor);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

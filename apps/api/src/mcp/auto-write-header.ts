import { createHash, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import type { McpAutoWriteRequest } from '../common/decorators/tool.decorator';

/**
 * O header com que o agente pede uma gravação automática (ADR 039, #385). JSON com a conversa,
 * a volta do agente e a chamada. Ausente é o caminho de sempre; malformado é 400 antes de abrir o
 * servidor — um header torto nunca pode virar escrita sem a checagem do modo.
 */
export const HEADER_AUTO_WRITE = 'x-fatia-auto-write';
/** A credencial de serviço do agente hospedado — a mesma `AGENT_API_KEY` que a API manda a ele. */
export const HEADER_AGENT_KEY = 'x-fatia-agent-key';

const schema = z
  .object({
    conversationId: z.string().uuid(),
    runId: z.string().min(1).max(64),
    toolCallId: z.string().min(1).max(200),
    // Só consulta se a chamada já gravou (o agente perdeu a resposta num timeout); nunca grava.
    lookup: z.literal(true).optional(),
  })
  .strict();

export function autoWriteFromHeader(
  raw: string | string[] | undefined,
): McpAutoWriteRequest | null {
  if (raw === undefined) return null;
  const texto = Array.isArray(raw) ? raw[0] : raw;
  try {
    return schema.parse(JSON.parse(texto ?? ''));
  } catch {
    throw new BadRequestException(`${HEADER_AUTO_WRITE} inválido.`);
  }
}

/**
 * O header da gravação automática só vale com a credencial do agente hospedado (#385). Um cliente
 * OAuth ou de token de API tem o bearer da pessoa, mas não a `AGENT_API_KEY`: mandar o header sem
 * ela é 403. Instância sem a chave configurada não aceita gravação automática de ninguém.
 */
export function autoWriteFromRequest(
  headers: Record<string, string | string[] | undefined>,
  agentKey: string,
): McpAutoWriteRequest | null {
  if (headers[HEADER_AUTO_WRITE] === undefined) return null;
  const raw = headers[HEADER_AGENT_KEY];
  const recebida = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const esperada = agentKey.trim();
  if (!esperada || !mesmaChave(recebida, esperada)) {
    throw new ForbiddenException(`${HEADER_AUTO_WRITE} só é aceito do agente hospedado.`);
  }
  return autoWriteFromHeader(headers[HEADER_AUTO_WRITE]);
}

/** Compara em tempo constante; o `sha256` iguala os tamanhos, que o `timingSafeEqual` exige. */
function mesmaChave(a: string, b: string): boolean {
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(a), digest(b));
}

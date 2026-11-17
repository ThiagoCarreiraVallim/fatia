import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { McpAutoWriteRequest } from '../common/decorators/tool.decorator';

/**
 * O header com que o agente pede uma gravação automática (ADR 039, #385). JSON com a conversa,
 * a volta do agente e a chamada. Ausente é o caminho de sempre; malformado é 400 antes de abrir o
 * servidor — um header torto nunca pode virar escrita sem a checagem do modo.
 */
export const HEADER_AUTO_WRITE = 'x-fatia-auto-write';

const schema = z
  .object({
    conversationId: z.string().uuid(),
    runId: z.string().min(1).max(64),
    toolCallId: z.string().min(1).max(200),
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

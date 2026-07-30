import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/**
 * Categorias de erro MCP documentadas na §Erros de `docs/MCP.md`.
 *
 * Antes deste mapeamento o registry só fazia re-throw da exception Nest, então o
 * Claude recebia um erro de protocolo opaco — sem categoria e sem pista do que
 * fazer a seguir. Categorizar permite que o modelo distinga "corrija o input"
 * de "esse recurso não existe" e aja sozinho (issue #94).
 */
export type McpErrorCategory =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Pista acionável por categoria — o que o cliente deve fazer, não só o que deu errado. */
const HINT: Record<McpErrorCategory, string> = {
  INVALID_INPUT: 'Corrija os campos indicados e chame a tool de novo.',
  NOT_FOUND:
    'O recurso não existe ou não pertence a este usuário. Confirme o ID com a tool de listagem correspondente.',
  CONFLICT:
    'A operação conflita com o estado atual. Leia o recurso antes de repetir — pode já ter sido criado ou finalizado.',
  UNAUTHORIZED: 'Credencial inválida ou expirada. O usuário precisa reconectar o Fatia.',
  RATE_LIMITED: 'Limite de requisições excedido. Espere alguns segundos antes de tentar de novo.',
  INTERNAL: 'Erro inesperado no servidor. Não repita automaticamente — reporte ao usuário.',
};

const STATUS_TO_CATEGORY: Record<number, McpErrorCategory> = {
  400: 'INVALID_INPUT',
  401: 'UNAUTHORIZED',
  403: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'INVALID_INPUT',
  429: 'RATE_LIMITED',
};

function messageOf(err: unknown): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object') {
      const { message } = response as { message?: unknown };
      if (Array.isArray(message)) return message.join('; ');
      if (typeof message === 'string') return message;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function categorizeError(err: unknown): { category: McpErrorCategory; message: string } {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    return { category: 'INVALID_INPUT', message: detail };
  }

  if (err instanceof HttpException) {
    return {
      category: STATUS_TO_CATEGORY[err.getStatus()] ?? 'INTERNAL',
      message: messageOf(err),
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint, P2003 = FK inválida, P2025 = registro ausente.
    if (err.code === 'P2002') {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'desconhecido');
      return { category: 'CONFLICT', message: `Já existe um registro com esse valor (${fields}).` };
    }
    if (err.code === 'P2025') {
      return { category: 'NOT_FOUND', message: 'Registro não encontrado.' };
    }
    if (err.code === 'P2003') {
      return {
        category: 'INVALID_INPUT',
        message: 'Referência inválida: o ID informado não existe.',
      };
    }
  }

  return { category: 'INTERNAL', message: messageOf(err) };
}

/** Texto entregue ao cliente MCP: categoria, causa e o que fazer a seguir. */
export function formatToolError(err: unknown): { category: McpErrorCategory; text: string } {
  const { category, message } = categorizeError(err);
  return { category, text: `[${category}] ${message}\n${HINT[category]}` };
}

import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * Cursor do histórico (#381): a posição da última linha, `startedAt|id`, em
 * base64url — opaco para quem pagina. É keyset, e não o `cursor` do Prisma:
 * aquele procura a linha do cursor por id sem o `where` da consulta, então a
 * sessão apagada no meio da paginação encerrava a lista em silêncio e a
 * sessão de outra pessoa servia de posição.
 */
export interface SessionPosition {
  startedAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeSessionCursor(position: SessionPosition): string {
  return Buffer.from(`${position.startedAt.toISOString()}|${position.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeSessionCursor(cursor: string): SessionPosition {
  const [iso, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const startedAt = new Date(iso ?? '');
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(startedAt.getTime())) {
    throw new BadRequestException('cursor inválido: use o nextCursor da página anterior.');
  }
  return { startedAt, id };
}

/**
 * As sessões depois da posição, na ordem `startedAt desc, id desc` — o
 * desempate pelo id mantém estável a ordem de quem começou no mesmo instante.
 */
export function afterSessionPosition(position: SessionPosition): Prisma.WorkoutSessionWhereInput {
  return {
    OR: [
      { startedAt: { lt: position.startedAt } },
      { startedAt: position.startedAt, id: { lt: position.id } },
    ],
  };
}

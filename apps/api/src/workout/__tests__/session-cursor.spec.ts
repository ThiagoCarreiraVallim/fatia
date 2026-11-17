import { BadRequestException } from '@nestjs/common';
import {
  afterSessionPosition,
  decodeSessionCursor,
  encodeSessionCursor,
} from '../helpers/session-cursor';

describe('cursor do histórico', () => {
  const position = {
    startedAt: new Date('2026-11-02T21:00:00.000Z'),
    id: '11111111-2222-4333-8444-555555555555',
  };

  it('vai e volta sem perder a posição', () => {
    expect(decodeSessionCursor(encodeSessionCursor(position))).toEqual(position);
  });

  it('id cru, lixo ou data inválida é 400', () => {
    for (const bad of [
      position.id,
      'nada',
      Buffer.from(`ontem|${position.id}`).toString('base64url'),
      Buffer.from(`2026-11-02T21:00:00.000Z|x`).toString('base64url'),
    ]) {
      expect(() => decodeSessionCursor(bad)).toThrow(BadRequestException);
    }
  });

  it('depois da posição: antes no tempo, ou no mesmo instante com id menor', () => {
    expect(afterSessionPosition(position)).toEqual({
      OR: [
        { startedAt: { lt: position.startedAt } },
        { startedAt: position.startedAt, id: { lt: position.id } },
      ],
    });
  });
});

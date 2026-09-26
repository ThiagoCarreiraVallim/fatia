import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    getConversation: vi.fn(async () => {
      throw new actual.ApiError('Conversa não encontrada.', 404);
    }),
  };
});

const { useChatThreadList } = await import('../use-chat-runtime');

describe('useChatThreadList', () => {
  it('conversa que ainda não existe no servidor é conversa nova, e não erro', async () => {
    const { result } = renderHook(() => useChatThreadList());
    const id = '3f1c9a52-6b1e-4d8a-9c2f-0a5e7b3d1c44';

    await expect(result.current.adapter.fetch(id)).resolves.toEqual({
      status: 'regular',
      remoteId: id,
      externalId: id,
    });
  });
});

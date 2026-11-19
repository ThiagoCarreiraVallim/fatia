import { afterEach, describe, expect, it, vi } from 'vitest';

const sub = vi.hoisted(() => ({ oneClick: vi.fn() }));
vi.mock('@/lib/announcement-subscription', () => ({ oneClickUnsubscribe: sub.oneClick }));

import { POST } from '../route';

describe('POST /api/descadastro (List-Unsubscribe-Post, #398)', () => {
  afterEach(() => vi.clearAllMocks());

  it('o provedor descadastra em um clique, com o token do link', async () => {
    sub.oneClick.mockResolvedValue(true);
    const r = await POST(
      new Request('https://app.fatia.test/api/descadastro?t=abc.def', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    expect(r.status).toBe(200);
    expect(sub.oneClick).toHaveBeenCalledWith('abc.def');
  });

  it('sem o corpo de um clique, não faz nada', async () => {
    const r = await POST(
      new Request('https://app.fatia.test/api/descadastro?t=abc.def', { method: 'POST' }),
    );
    expect(r.status).toBe(400);
    expect(sub.oneClick).not.toHaveBeenCalled();
  });

  it('a API recusou: o provedor recebe erro para tentar depois', async () => {
    sub.oneClick.mockResolvedValue(false);
    const r = await POST(
      new Request('https://app.fatia.test/api/descadastro?t=abc.def', {
        method: 'POST',
        body: 'List-Unsubscribe=One-Click',
      }),
    );
    expect(r.status).toBe(502);
  });
});

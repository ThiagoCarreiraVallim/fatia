import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAnnouncementSubscription,
  oneClickUnsubscribe,
  setAnnouncementSubscription,
} from '../announcement-subscription';

const TOKEN = `${'a'.repeat(34)}.${'b'.repeat(43)}`;
const res = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('descadastro do e-mail de comunicados (#398)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('token fora do formato nem vai à rede: link inválido', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await fetchAnnouncementSubscription('x')).toEqual({ kind: 'invalid' });
    expect(await setAnnouncementSubscription('a.b', false)).toEqual({ kind: 'invalid' });
    expect(f).not.toHaveBeenCalled();
  });

  it('lê pelo GET e muda só pelo POST, com o token', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { subscribed: true }));
    vi.stubGlobal('fetch', f);
    expect(await fetchAnnouncementSubscription(TOKEN)).toEqual({ kind: 'ok', subscribed: true });
    expect(f.mock.calls[0]![0]).toContain(`/api/email/announcements/subscription?t=${TOKEN}`);
    await setAnnouncementSubscription(TOKEN, false);
    expect(f.mock.calls[1]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ t: TOKEN, subscribed: false }),
    });
  });

  it('só o 400 é link inválido; 429, 5xx e rede caída são "tente de novo"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400)));
    expect(await fetchAnnouncementSubscription(TOKEN)).toEqual({ kind: 'invalid' });
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(status)));
      expect(await fetchAnnouncementSubscription(TOKEN)).toEqual({ kind: 'unavailable' });
      expect(await setAnnouncementSubscription(TOKEN, true)).toEqual({ kind: 'unavailable' });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')));
    expect(await setAnnouncementSubscription(TOKEN, true)).toEqual({ kind: 'unavailable' });
  });

  it('um clique do provedor vai ao POST de um clique da API', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { subscribed: false }));
    vi.stubGlobal('fetch', f);
    expect(await oneClickUnsubscribe(TOKEN)).toBe(true);
    expect(f.mock.calls[0]![0]).toContain(`/api/email/announcements/one-click?t=${TOKEN}`);
    expect(f.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: 'List-Unsubscribe=One-Click',
    });
  });
});

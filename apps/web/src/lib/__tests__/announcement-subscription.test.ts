import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAnnouncementSubscription,
  setAnnouncementSubscription,
} from '../announcement-subscription';

const TOKEN = `${'a'.repeat(34)}.${'b'.repeat(43)}`;

describe('descadastro do e-mail de comunicados (#398)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('token fora do formato nem vai à rede', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await fetchAnnouncementSubscription('x')).toBeNull();
    expect(await setAnnouncementSubscription('a.b', false)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('lê pelo GET e muda só pelo POST, com o token', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ subscribed: true }) });
    vi.stubGlobal('fetch', f);
    expect(await fetchAnnouncementSubscription(TOKEN)).toEqual({ subscribed: true });
    expect(f.mock.calls[0]![0]).toContain(`/api/email/announcements/subscription?t=${TOKEN}`);
    expect(f.mock.calls[0]![1]).toEqual({ cache: 'no-store' });
    await setAnnouncementSubscription(TOKEN, false);
    expect(f.mock.calls[1]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ t: TOKEN, subscribed: false }),
    });
  });

  it('API recusou ou caiu: nulo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchAnnouncementSubscription(TOKEN)).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')));
    expect(await setAnnouncementSubscription(TOKEN, true)).toBeNull();
  });
});

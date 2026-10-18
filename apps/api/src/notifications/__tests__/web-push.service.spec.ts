import type { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { WebPushService, isPushEndpoint } from '../web-push.service';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const LIGADO = {
  WEB_PUSH_VAPID_PUBLIC_KEY: 'pub',
  WEB_PUSH_VAPID_PRIVATE_KEY: 'priv',
  WEB_PUSH_SUBJECT: 'mailto:ops@fatia.test',
};
const alvo = (endpoint: string) => ({ endpoint, p256dh: 'k', auth: 'a' });

describe('WebPushService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reconhece só os serviços de push dos navegadores, em https e sem porta', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QH8')).toBe(true);
    expect(isPushEndpoint('https://wns2-db5p.notify.windows.com/w/?token=x')).toBe(true);
    for (const ruim of [
      'http://fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://fcm.googleapis.com.evil.com/x',
      'https://127.0.0.1/x',
      'not a url',
    ]) {
      expect(isPushEndpoint(ruim)).toBe(false);
    }
  });

  it('sem as três chaves, desligado: sem chave pública e sem envio', async () => {
    const spy = jest.spyOn(webpush, 'sendNotification');
    const s = new WebPushService(config({ WEB_PUSH_VAPID_PUBLIC_KEY: 'pub' }));
    expect(s.publicKey()).toBeNull();
    expect(
      await s.send([alvo('https://fcm.googleapis.com/x')], { title: 't', body: 'b', url: '/' }),
    ).toEqual({ gone: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('manda o aviso e devolve os endpoints que acabaram (404/410)', async () => {
    const spy = jest.spyOn(webpush, 'sendNotification').mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith('/morto'))
        throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (sub.endpoint.endsWith('/falha')) throw Object.assign(new Error('x'), { statusCode: 500 });
      return { statusCode: 201, body: '', headers: {} };
    });
    const s = new WebPushService(config(LIGADO));
    const r = await s.send(
      [
        alvo('https://fcm.googleapis.com/vivo'),
        alvo('https://fcm.googleapis.com/morto'),
        alvo('https://fcm.googleapis.com/falha'),
      ],
      { title: 'Oi', body: 'Corpo', url: '/community' },
    );
    expect(r).toEqual({ gone: ['https://fcm.googleapis.com/morto'] });
    expect(JSON.parse(spy.mock.calls[0][1] as string)).toEqual({
      title: 'Oi',
      body: 'Corpo',
      url: '/community',
    });
  });
});

import type { ConfigService } from '@nestjs/config';
import { EXPO_PUSH_TOKEN, EXPO_PUSH_URL, PushService, type PushMessage } from '../push.service';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const msg = (i: number): PushMessage => ({
  to: `ExponentPushToken[token-${String(i).padStart(4, '0')}]`,
  title: 'Título',
  body: 'Corpo',
  url: '/community/g1',
});

const tickets = (n: number, erro?: (i: number) => string | undefined) =>
  new Response(
    JSON.stringify({
      data: Array.from({ length: n }, (_, i) =>
        erro?.(i)
          ? { status: 'error', details: { error: erro(i) } }
          : { status: 'ok', id: `t${i}` },
      ),
    }),
    { status: 200 },
  );

describe('PushService', () => {
  let fetchMock: jest.SpyInstance;
  afterEach(() => fetchMock?.mockRestore());

  it('desligado não chama a Expo', async () => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    const r = await new PushService(config({})).send([msg(1)]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r).toEqual({ sent: 0, unregistered: [] });
  });

  it('manda em lotes de 100, com o caminho em data.url e o canal dos avisos', async () => {
    const corpos: unknown[][] = [];
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toBe(EXPO_PUSH_URL);
      const body = JSON.parse(String(init!.body)) as unknown[];
      corpos.push(body);
      return tickets(body.length);
    });
    const r = await new PushService(config({ PUSH_ENABLED: 'true' })).send(
      Array.from({ length: 150 }, (_, i) => msg(i)),
    );
    expect(corpos.map((c) => c.length)).toEqual([100, 50]);
    expect(corpos[0]![0]).toMatchObject({
      to: msg(0).to,
      title: 'Título',
      body: 'Corpo',
      data: { url: '/community/g1' },
      channelId: 'avisos',
    });
    expect(r.sent).toBe(150);
  });

  it('manda o token de acesso da Expo quando existe', async () => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(tickets(1));
    await new PushService(config({ PUSH_ENABLED: 'true', EXPO_ACCESS_TOKEN: 'segredo' })).send([
      msg(1),
    ]);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer segredo');
  });

  it('devolve os tokens que a Expo diz que não existem mais', async () => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        tickets(3, (i) =>
          i === 1 ? 'DeviceNotRegistered' : i === 2 ? 'MessageRateExceeded' : undefined,
        ),
      );
    const r = await new PushService(config({ PUSH_ENABLED: 'true' })).send([
      msg(0),
      msg(1),
      msg(2),
    ]);
    expect(r).toEqual({ sent: 1, unregistered: [msg(1).to] });
  });

  it('falha de rede num lote não derruba quem chamou nem os outros lotes', async () => {
    let chamada = 0;
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      chamada += 1;
      if (chamada === 1) throw new Error('rede caiu');
      return tickets((JSON.parse(String(init!.body)) as unknown[]).length);
    });
    const r = await new PushService(config({ PUSH_ENABLED: 'true' })).send(
      Array.from({ length: 120 }, (_, i) => msg(i)),
    );
    expect(r.sent).toBe(20);
  });

  it('o formato do token aceita só o da Expo', () => {
    expect(EXPO_PUSH_TOKEN.test('ExponentPushToken[abcdEFGH1234]')).toBe(true);
    expect(EXPO_PUSH_TOKEN.test('ExpoPushToken[abcdEFGH1234]')).toBe(true);
    expect(EXPO_PUSH_TOKEN.test('https://evil.example/ExponentPushToken[x]')).toBe(false);
    expect(EXPO_PUSH_TOKEN.test('ExponentPushToken[abc]')).toBe(false);
    expect(EXPO_PUSH_TOKEN.test('ExponentPushToken[abcdEFGH1234] ')).toBe(false);
  });
});

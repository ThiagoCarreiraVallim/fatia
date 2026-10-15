import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { RevenueCatService } from '../revenuecat/revenuecat.service';

/**
 * RevenueCat contra o Postgres de teste; a REST é dublê (`fetch`).
 * Requer `DATABASE_URL` com migrations aplicadas.
 */
const AUTH = 'segredo-rc';
const prisma = new PrismaService();
const env: Record<string, string> = {
  REVENUECAT_WEBHOOK_AUTH: AUTH,
  REVENUECAT_SECRET_KEY: 'sk_teste',
  REVENUECAT_ENTITLEMENT_ID: 'pro',
  REVENUECAT_BASE_URL: 'https://rc.invalid',
};
const config = { get: (k: string, p?: unknown) => env[k] ?? p } as unknown as ConfigService;

const assinanteComPro = (produto: string, expira: string, extra: Record<string, unknown> = {}) => ({
  subscriber: {
    entitlements: { pro: { expires_date: expira, product_identifier: produto } },
    subscriptions: { [produto]: { expires_date: expira, store: 'app_store', ...extra } },
  },
});

describe('RevenueCatService (banco real)', () => {
  const fetchOriginal = globalThis.fetch;
  const stamp = `rc-${Date.now()}`;
  let userId: string;
  let outro: string;
  let fetchMock: jest.Mock;
  const service = new RevenueCatService(prisma, config);

  const responder = (corpo: unknown, status = 200) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(corpo), { status }));
  const webhook = (id: string, appUserId: string, type = 'INITIAL_PURCHASE') =>
    JSON.stringify({ api_version: '1.0', event: { id, type, app_user_id: appUserId } });
  const linhas = (id: string) =>
    prisma.userSubscription.findMany({ where: { userId: id }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const [a, b] = await Promise.all(
      ['a', 'b'].map((s) =>
        prisma.user.create({
          data: { logtoSub: `${stamp}-${s}`, email: `${stamp}-${s}@test.local`, name: s },
        }),
      ),
    );
    userId = a.id;
    outro = b.id;
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, outro] } } });
    await prisma.billingWebhookEvent.deleteMany({ where: { eventId: { startsWith: stamp } } });
    await prisma.$disconnect();
  });

  it('header errado é 401 e não lê a REST', async () => {
    await expect(
      service.processarWebhook('Bearer outro', webhook(`${stamp}-x`, userId)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compra: o webhook lê o assinante na REST e grava APPLE ativa', async () => {
    responder(assinanteComPro('fatia_pro_mensal', '2026-11-15T00:00:00Z'));

    expect(await service.processarWebhook(AUTH, webhook(`${stamp}-1`, userId))).toEqual({
      received: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://rc.invalid/v1/subscribers/${userId}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_teste');
    expect(await linhas(userId)).toEqual([
      expect.objectContaining({ source: 'APPLE', status: 'ACTIVE', interval: 'MONTHLY' }),
    ]);
  });

  it('o mesmo evento de novo é no-op', async () => {
    expect(await service.processarWebhook(AUTH, webhook(`${stamp}-1`, userId))).toEqual({
      received: true,
      duplicate: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('troca para o anual expira a mensal e cria a anual', async () => {
    responder(assinanteComPro('fatia_pro_anual', '2027-10-15T00:00:00Z'));

    await service.sincronizar(userId);

    const todas = await linhas(userId);
    expect(todas.map((l) => [l.productId, l.status])).toEqual([
      ['fatia_pro_mensal', 'EXPIRED'],
      ['fatia_pro_anual', 'ACTIVE'],
    ]);
  });

  it('expiração (entitlement some) encerra a linha de loja', async () => {
    responder({ subscriber: { entitlements: {}, subscriptions: {} } });

    await service.processarWebhook(AUTH, webhook(`${stamp}-2`, userId, 'EXPIRATION'));

    expect((await linhas(userId)).every((l) => l.status === 'EXPIRED')).toBe(true);
  });

  it('usuário que não existe é registrado e responde 200', async () => {
    expect(
      await service.processarWebhook(
        AUTH,
        webhook(`${stamp}-3`, '00000000-0000-4000-8000-000000000000'),
      ),
    ).toEqual({ received: true, ignored: 'usuario_desconhecido' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('REST fora do ar é 503 e o evento não fica como processado (a reentrega funciona)', async () => {
    responder({}, 500);
    await expect(
      service.processarWebhook(AUTH, webhook(`${stamp}-4`, outro)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await prisma.billingWebhookEvent.count({ where: { eventId: `${stamp}-4` } })).toBe(0);

    responder(assinanteComPro('fatia_pro_mensal', '2026-11-15T00:00:00Z'));
    expect(await service.processarWebhook(AUTH, webhook(`${stamp}-4`, outro))).toEqual({
      received: true,
    });
  });

  it('isolamento: sincronizar uma pessoa não toca as linhas da outra', async () => {
    responder({ subscriber: { entitlements: {}, subscriptions: {} } });
    await service.sincronizar(userId);
    expect(await linhas(outro)).toEqual([expect.objectContaining({ status: 'ACTIVE' })]);
  });
});

import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma.service';
import { SubscriptionEntitlementsService } from '../subscription-entitlements.service';

function montar(env: Record<string, unknown>, findMany: jest.Mock) {
  const config = {
    get: (k: string, padrao?: unknown) => env[k] ?? padrao,
  } as unknown as ConfigService;
  const prisma = { userSubscription: { findMany } } as unknown as PrismaService;
  const service = new SubscriptionEntitlementsService(prisma, config);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  return service;
}

describe('SubscriptionEntitlementsService', () => {
  it('instância sem exigência de plano (self-host) libera a IA para quem não assina', async () => {
    const service = montar({ AI_REQUIRES_PLAN: false }, jest.fn().mockResolvedValue([]));
    expect(await service.aiTierForUser('u')).toMatchObject({ tier: 'PRO', source: 'INSTANCE' });
  });

  it('com exigência de plano, quem não assina é Free', async () => {
    const service = montar({ AI_REQUIRES_PLAN: true }, jest.fn().mockResolvedValue([]));
    expect(await service.aiTierForUser('u')).toMatchObject({ tier: 'FREE' });
  });

  it('lê só as assinaturas da própria pessoa', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await montar({ AI_REQUIRES_PLAN: true }, findMany).aiTierForUser('pessoa-a');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'pessoa-a' } }),
    );
  });

  it('nunca lança: banco fora do ar com plano exigido responde Free', async () => {
    const service = montar(
      { AI_REQUIRES_PLAN: true },
      jest.fn().mockRejectedValue(new Error('db')),
    );
    await expect(service.aiTierForUser('u')).resolves.toMatchObject({ tier: 'FREE' });
  });
});

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AI_CONSENT_VERSIONS, AiConsentService } from '../consent/ai-consent.service';

/**
 * Os aceites do chat (#384): "Antes de conversar" (Apple 5.1.2) e "Buscar na web?". Contra
 * Postgres de verdade: a garantia é "sem a linha, nada vai ao provedor".
 */
describe('AiConsentService', () => {
  const prisma = new PrismaService();
  const service = new AiConsentService(prisma);
  let user = '';
  let outra = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Este spec exige Postgres (DATABASE_URL).');
    await prisma.$connect();
    const stamp = `consent-${Date.now()}`;
    const [a, b] = await Promise.all(
      ['a', 'b'].map((s) =>
        prisma.user.create({
          data: { logtoSub: `${stamp}-${s}`, email: `${stamp}-${s}@test.local`, name: s },
        }),
      ),
    );
    user = a.id;
    outra = b.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [user, outra] } } });
    await prisma.$disconnect();
  });

  it('sem aceite, o chat recusa com AI_CONSENT_REQUIRED e a busca pede o aceite', async () => {
    await expect(service.assertChatConsent(user)).rejects.toThrow(ForbiddenException);
    await expect(service.assertChatConsent(user)).rejects.toMatchObject({
      response: { code: 'AI_CONSENT_REQUIRED' },
    });
    const status = await service.status(user);
    expect(status.chat.accepted).toBe(false);
    expect(status.webSearch.accepted).toBe(false);
    expect(status.webSearchEnabled).toBe(true);
    await expect(service.webSearchMode(user)).resolves.toBe('ask');
  });

  it('o aceite da versão atual libera o chat e fica gravado com a data e a versão', async () => {
    await service.accept(user, 'chat', AI_CONSENT_VERSIONS.chat);
    await expect(service.assertChatConsent(user)).resolves.toBeUndefined();
    const linha = await prisma.aiConsent.findFirst({ where: { userId: user, kind: 'CHAT' } });
    expect(linha).toMatchObject({ version: AI_CONSENT_VERSIONS.chat });
    expect(linha?.acceptedAt).toBeInstanceOf(Date);
  });

  it('aceitar de novo a mesma versão não duplica a linha', async () => {
    await service.accept(user, 'chat', AI_CONSENT_VERSIONS.chat);
    expect(await prisma.aiConsent.count({ where: { userId: user, kind: 'CHAT' } })).toBe(1);
  });

  it('recusa o aceite de um texto que não é o atual: quem leu outro texto não aceitou este', async () => {
    await expect(service.accept(user, 'web_search', '2000-01-01')).rejects.toThrow(
      ConflictException,
    );
    await expect(service.webSearchMode(user)).resolves.toBe('ask');
  });

  it('busca: aceita vira "on"; desligada vira "off" mesmo com aceite', async () => {
    await service.accept(user, 'web_search', AI_CONSENT_VERSIONS.webSearch);
    await expect(service.webSearchMode(user)).resolves.toBe('on');
    await service.setWebSearch(user, false);
    await expect(service.webSearchMode(user)).resolves.toBe('off');
    expect((await service.status(user)).webSearchEnabled).toBe(false);
  });

  it('o aceite e a preferência de uma pessoa não valem para outra', async () => {
    await expect(service.assertChatConsent(outra)).rejects.toThrow(ForbiddenException);
    await expect(service.webSearchMode(outra)).resolves.toBe('ask');
  });
});

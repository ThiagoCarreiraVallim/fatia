import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import {
  AI_CONSENT_VERSIONS,
  AiConsentService,
  aiProcessorFromEnv,
} from '../consent/ai-consent.service';

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
    expect(linha?.version.startsWith(AI_CONSENT_VERSIONS.chat)).toBe(true);
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

  it('os nomes do provedor, do modelo e da busca vêm do ambiente, com o padrão de hoje', () => {
    // A voz do ditado vai a outro modelo (#488): o aceite nomeia os dois.
    expect(aiProcessorFromEnv({})).toEqual({
      provider: 'OpenRouter',
      model: 'GLM 5.3 Flash, da Z.ai (na voz, Gemini 3.5 Flash Lite, do Google)',
      searchEngine: 'Exa',
    });
    expect(
      aiProcessorFromEnv({
        AI_CONSENT_PROVIDER: 'Outro',
        AI_CONSENT_MODEL: 'Modelo X',
        AI_CONSENT_SEARCH_ENGINE: 'Busca Y',
      }),
    ).toEqual({ provider: 'Outro', model: 'Modelo X', searchEngine: 'Busca Y' });
  });

  it('o status traz os nomes que o texto do aceite mostra', async () => {
    const outro = new AiConsentService(prisma, {
      provider: 'P',
      model: 'M',
      searchEngine: 'S',
    });
    expect((await outro.status(user)).processor).toEqual({
      provider: 'P',
      model: 'M',
      searchEngine: 'S',
    });
  });

  it('trocar o modelo ou a busca pede o aceite de novo: quem aceitou um nome não aceitou outro', async () => {
    const pessoa = await prisma.user.create({
      data: { logtoSub: `troca-${Date.now()}`, email: `troca-${Date.now()}@test.local`, name: 't' },
    });
    try {
      const antes = new AiConsentService(prisma, {
        provider: 'P',
        model: 'M1',
        searchEngine: 'S1',
      });
      await antes.accept(pessoa.id, 'chat', AI_CONSENT_VERSIONS.chat);
      await antes.accept(pessoa.id, 'web_search', AI_CONSENT_VERSIONS.webSearch);
      await expect(antes.assertChatConsent(pessoa.id)).resolves.toBeUndefined();

      const depois = new AiConsentService(prisma, {
        provider: 'P',
        model: 'M2',
        searchEngine: 'S2',
      });
      await expect(depois.assertChatConsent(pessoa.id)).rejects.toThrow(ForbiddenException);
      await expect(depois.webSearchMode(pessoa.id)).resolves.toBe('ask');
      const status = await depois.status(pessoa.id);
      expect(status.chat.accepted).toBe(false);
      // O cliente manda a mesma versão do texto; o aceite novo grava os nomes de agora.
      expect(status.chat.version).toBe(AI_CONSENT_VERSIONS.chat);
      await depois.accept(pessoa.id, 'chat', AI_CONSENT_VERSIONS.chat);
      await expect(depois.assertChatConsent(pessoa.id)).resolves.toBeUndefined();
    } finally {
      await prisma.user.delete({ where: { id: pessoa.id } });
    }
  });

  it('o 403 diz o que fazer também para o app antigo, que só mostra a mensagem', async () => {
    await expect(service.assertChatConsent(outra)).rejects.toMatchObject({
      response: { message: expect.stringMatching(/atualize o app/i) },
    });
  });
});

import { randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { JwtValidationService, LogtoJwtPayload } from '../jwt-validation.service';
import { UserProvisioningService } from '../user-provisioning.service';
import {
  hashAccessToken,
  McpConnectionService,
  TOUCH_INTERVAL_MS,
} from '../mcp-connection.service';

/**
 * Vínculo entre a pessoa e o app de IA que ela conectou (#388), contra Postgres
 * real. É o que dá à tela "Conectar sua IA" o "Conectado ao Claude · último
 * acesso agora".
 *
 * Só a verificação do JWT é falsa (o JWKS é do Logto): cada token de teste
 * resolve para um `sub` fixo, e o resto — provisionamento, upsert, toque — é o
 * código de verdade.
 */

const stamp = `mcpconn-${Date.now()}`;
const SUB_A = `${stamp}-a`;
const SUB_B = `${stamp}-b`;
/** token → sub, como o Logto assinaria. Token fora da lista = inválido. */
const TOKENS: Record<string, string> = {};
/** Um access token novo para a pessoa: cada emissão do Logto é um token diferente. */
function tokenOf(sub: string): string {
  const token = `${sub}-tok-${randomBytes(6).toString('hex')}`;
  TOKENS[token] = sub;
  return token;
}

const validation = {
  verify: jest.fn(async (token: string): Promise<LogtoJwtPayload> => {
    const sub = TOKENS[token];
    if (!sub) throw new UnauthorizedException('Invalid token');
    return { sub, email: `${sub}@test.local`, name: sub };
  }),
} as unknown as JwtValidationService;

describe('McpConnectionService', () => {
  const prisma = new PrismaService();
  const service = new McpConnectionService(prisma, validation, new UserProvisioningService(prisma));
  const clients: string[] = [];
  let userA = '';
  let userB = '';

  async function newClient(clientName: string | null = 'Claude') {
    const clientId = `mcp_${randomBytes(16).toString('hex')}`;
    clients.push(clientId);
    await prisma.mcpOAuthClient.create({
      data: { clientId, clientName, redirectUris: ['https://claude.ai/api/mcp/auth_callback'] },
    });
    return clientId;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('Este spec exige Postgres (DATABASE_URL com as migrations aplicadas).');
    }
    await prisma.$connect();
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { logtoSub: SUB_A, email: `${SUB_A}@test.local`, name: 'A' } }),
      prisma.user.create({ data: { logtoSub: SUB_B, email: `${SUB_B}@test.local`, name: 'B' } }),
    ]);
    userA = a.id;
    userB = b.id;
  });

  afterAll(async () => {
    await prisma.mcpOAuthClient.deleteMany({ where: { clientId: { in: clients } } });
    await prisma.user.deleteMany({ where: { logtoSub: { in: [SUB_A, SUB_B] } } });
    await prisma.$disconnect();
  });

  it('liga o cliente a quem é dono do token entregue, e só a ele', async () => {
    const clientId = await newClient('Claude');

    await service.recordIssuedToken(clientId, { access_token: tokenOf(SUB_A) });

    const deA = await service.list(userA);
    expect(deA).toHaveLength(1);
    expect(deA[0]).toMatchObject({ clientName: 'Claude' });
    expect(deA[0]!.lastUsedAt).toBeInstanceOf(Date);
    expect(await service.list(userB)).toEqual([]);
  });

  it('o mesmo cliente renovando o token não duplica a conexão', async () => {
    const clientId = await newClient('ChatGPT');

    const renewed = tokenOf(SUB_A);
    await service.recordIssuedToken(clientId, { access_token: tokenOf(SUB_A) });
    await service.recordIssuedToken(clientId, { access_token: renewed });

    const rows = await prisma.mcpOAuthConnection.findMany({ where: { clientId } });
    expect(rows).toHaveLength(1);
    // O hash acompanha o token mais novo: é por ele que o /mcp acha a conexão.
    expect(rows[0]!.accessTokenHash).toBe(hashAccessToken(renewed));
  });

  it('o mesmo cliente autorizado por duas pessoas vira duas conexões', async () => {
    const clientId = await newClient('Outro app');

    await service.recordIssuedToken(clientId, { access_token: tokenOf(SUB_B) });
    await service.recordIssuedToken(clientId, { access_token: tokenOf(SUB_A) });

    const rows = await prisma.mcpOAuthConnection.findMany({ where: { clientId } });
    expect(rows.map((r) => r.userId).sort()).toEqual([userA, userB].sort());
  });

  it('nunca lança: token inválido, cliente desconhecido ou sem client_id não gravam nada', async () => {
    const before = await prisma.mcpOAuthConnection.count();

    await expect(
      service.recordIssuedToken(await newClient(), { access_token: 'token-falso' }),
    ).resolves.toBeUndefined();
    await expect(
      service.recordIssuedToken('mcp_nao_existe', { access_token: tokenOf(SUB_A) }),
    ).resolves.toBeUndefined();
    await expect(
      service.recordIssuedToken(undefined, { access_token: tokenOf(SUB_A) }),
    ).resolves.toBeUndefined();
    await expect(service.recordIssuedToken(await newClient(), {})).resolves.toBeUndefined();

    expect(await prisma.mcpOAuthConnection.count()).toBe(before);
  });

  describe('toque do /mcp (último acesso)', () => {
    it('atualiza só a conexão do token que chamou', async () => {
      const claude = await newClient('Claude');
      const chatgpt = await newClient('ChatGPT');
      const tokenB = tokenOf(SUB_B);
      await service.recordIssuedToken(claude, { access_token: tokenOf(SUB_A) });
      await service.recordIssuedToken(chatgpt, { access_token: tokenB });
      const old = new Date(Date.now() - 2 * TOUCH_INTERVAL_MS);
      await prisma.mcpOAuthConnection.updateMany({
        where: { clientId: { in: [claude, chatgpt] } },
        data: { lastUsedAt: old },
      });

      await service.touch(tokenB);

      const byClient = async (clientId: string) =>
        (await prisma.mcpOAuthConnection.findMany({ where: { clientId } }))[0]!.lastUsedAt;
      expect((await byClient(chatgpt)).getTime()).toBeGreaterThan(old.getTime());
      expect((await byClient(claude)).getTime()).toBe(old.getTime());
    });

    it('não grava de novo dentro do intervalo', async () => {
      const clientId = await newClient('Claude');
      const token = tokenOf(SUB_A);
      await service.recordIssuedToken(clientId, { access_token: token });
      const recent = new Date(Date.now() - 1_000);
      await prisma.mcpOAuthConnection.updateMany({
        where: { clientId },
        data: { lastUsedAt: recent },
      });

      await service.touch(token);

      const row = await prisma.mcpOAuthConnection.findFirstOrThrow({ where: { clientId } });
      expect(row.lastUsedAt.getTime()).toBe(recent.getTime());
    });

    it('token que não é de conexão nenhuma (o do próprio app) não faz nada nem lança', async () => {
      await expect(service.touch('token-do-pwa')).resolves.toBeUndefined();
      await expect(service.touch('')).resolves.toBeUndefined();
    });
  });

  it('lista da mais recente para a mais antiga', async () => {
    const velho = await newClient('Velho');
    const novo = await newClient('Novo');
    await service.recordIssuedToken(velho, { access_token: tokenOf(SUB_B) });
    await service.recordIssuedToken(novo, { access_token: tokenOf(SUB_B) });
    await prisma.mcpOAuthConnection.updateMany({
      where: { clientId: velho },
      data: { lastUsedAt: new Date('2026-01-01') },
    });

    const names = (await service.list(userB)).map((c) => c.clientName);
    expect(names.indexOf('Novo')).toBeLessThan(names.indexOf('Velho'));
  });
});

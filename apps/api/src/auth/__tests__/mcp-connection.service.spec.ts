import { randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { JwtValidationService, LogtoJwtPayload } from '../jwt-validation.service';
import { UserProvisioningService } from '../user-provisioning.service';
import {
  hashToken,
  McpConnectionRecorder,
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
/** O refresh token do Logto é opaco: não diz de quem é. */
const refreshToken = () => `rt-${randomBytes(12).toString('hex')}`;
/** Uma resposta do /oidc/token do Logto. */
const issued = (sub: string, refresh = refreshToken()) => ({
  access_token: tokenOf(sub),
  refresh_token: refresh,
  expires_in: 3600,
  token_type: 'Bearer',
});

const validation = {
  verify: jest.fn(async (token: string): Promise<LogtoJwtPayload> => {
    const sub = TOKENS[token];
    if (!sub) throw new UnauthorizedException('Invalid token');
    return { sub, email: `${sub}@test.local`, name: sub };
  }),
} as unknown as JwtValidationService;

describe('McpConnectionService', () => {
  const prisma = new PrismaService();
  const service = new McpConnectionService(prisma);
  const recorder = new McpConnectionRecorder(
    prisma,
    validation,
    new UserProvisioningService(prisma),
    service,
  );
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

  /** Grava como o facade grava (sem esperar) e espera aqui, para poder conferir. */
  async function exchange(clientId: string, tokens: Record<string, unknown>) {
    recorder.recordExchange(clientId, tokens);
    await recorder.flush();
  }
  async function refresh(presented: string, tokens: Record<string, unknown>, clientId?: string) {
    recorder.recordRefresh(presented, tokens, clientId);
    await recorder.flush();
  }
  const connectionsOf = (clientId: string) =>
    prisma.mcpOAuthConnection.findMany({ where: { clientId } });
  async function makeOld(clientId: string) {
    const old = new Date(Date.now() - 2 * TOUCH_INTERVAL_MS);
    await prisma.mcpOAuthConnection.updateMany({ where: { clientId }, data: { lastUsedAt: old } });
    return old;
  }
  const lastUsed = async (clientId: string) => (await connectionsOf(clientId))[0]!.lastUsedAt;

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

  describe('troca do code', () => {
    it('liga o cliente a quem é dono do token entregue, e só a ele', async () => {
      const clientId = await newClient('Claude');

      await exchange(clientId, issued(SUB_A));

      const deA = await service.list(userA);
      expect(deA).toHaveLength(1);
      expect(deA[0]).toMatchObject({ clientName: 'Claude' });
      expect(deA[0]!.lastUsedAt).toBeInstanceOf(Date);
      expect(await service.list(userB)).toEqual([]);
    });

    it('guarda só hashes dos tokens, nunca o token', async () => {
      const clientId = await newClient();
      const tokens = issued(SUB_A);

      await exchange(clientId, tokens);

      const [conn] = await connectionsOf(clientId);
      const rows = await prisma.mcpOAuthConnectionToken.findMany({
        where: { connectionId: conn!.id },
      });
      expect(rows.map((r) => [r.kind, r.hash]).sort()).toEqual(
        [
          ['access', hashToken(tokens.access_token)],
          ['refresh', hashToken(tokens.refresh_token)],
        ].sort(),
      );
      // O access token vale o expires_in que o Logto deu.
      const access = rows.find((r) => r.kind === 'access')!;
      expect(access.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500_000);
      expect(access.expiresAt.getTime()).toBeLessThan(Date.now() + 3700_000);
    });

    it('dois aparelhos no mesmo cliente: uma conexão, e os dois tokens marcam o acesso', async () => {
      const clientId = await newClient('Claude');
      const celular = issued(SUB_A);
      const computador = issued(SUB_A);
      await exchange(clientId, celular);
      await exchange(clientId, computador);
      expect(await connectionsOf(clientId)).toHaveLength(1);

      const old = await makeOld(clientId);
      await service.touch(celular.access_token);
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(old.getTime());

      await makeOld(clientId);
      await service.touch(computador.access_token);
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(old.getTime());
    });

    it('o mesmo cliente autorizado por duas pessoas vira duas conexões', async () => {
      const clientId = await newClient('Outro app');

      await exchange(clientId, issued(SUB_B));
      await exchange(clientId, issued(SUB_A));

      const rows = await connectionsOf(clientId);
      expect(rows.map((r) => r.userId).sort()).toEqual([userA, userB].sort());
    });

    it('nunca lança: token inválido, cliente desconhecido ou resposta sem token não gravam nada', async () => {
      const before = await prisma.mcpOAuthConnection.count();

      expect(() => recorder.recordExchange('x', { access_token: 'token-falso' })).not.toThrow();
      await exchange(await newClient(), { access_token: 'token-falso' });
      await exchange('mcp_nao_existe', issued(SUB_A));
      await exchange(await newClient(), {});

      expect(await prisma.mcpOAuthConnection.count()).toBe(before);
    });
  });

  describe('refresh', () => {
    it('acha a conexão pelo refresh token apresentado, sem client_id', async () => {
      const clientId = await newClient('Claude');
      const first = issued(SUB_A);
      await exchange(clientId, first);
      const old = await makeOld(clientId);

      const renewed = issued(SUB_A);
      await refresh(first.refresh_token, renewed);

      // O refresh em si já é um acesso.
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(old.getTime());
      // O access token novo passa a marcar o acesso dessa conexão.
      await makeOld(clientId);
      await service.touch(renewed.access_token);
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(old.getTime());
      expect(await connectionsOf(clientId)).toHaveLength(1);
    });

    it('com rotação, o refresh token velho sai e o novo serve no próximo refresh', async () => {
      const clientId = await newClient('Claude');
      const first = issued(SUB_A);
      await exchange(clientId, first);
      const second = issued(SUB_A);
      await refresh(first.refresh_token, second);

      const refreshHashes = (
        await prisma.mcpOAuthConnectionToken.findMany({
          where: { connection: { clientId }, kind: 'refresh' },
        })
      ).map((r) => r.hash);
      expect(refreshHashes).toEqual([hashToken(second.refresh_token)]);

      const third = issued(SUB_A);
      await refresh(second.refresh_token, third);
      await makeOld(clientId);
      await service.touch(third.access_token);
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(Date.now() - 10_000);
    });

    it('sem rotação (o Logto não manda refresh_token novo), o mesmo refresh continua valendo', async () => {
      const clientId = await newClient('Claude');
      const first = issued(SUB_A);
      await exchange(clientId, first);

      await refresh(first.refresh_token, { access_token: tokenOf(SUB_A), expires_in: 3600 });
      const again = { access_token: tokenOf(SUB_A), expires_in: 3600 };
      await refresh(first.refresh_token, again);

      await makeOld(clientId);
      await service.touch(again.access_token);
      expect((await lastUsed(clientId)).getTime()).toBeGreaterThan(Date.now() - 10_000);
    });

    it('client_id do corpo não manda: o de outro cliente é ignorado e não cria linha', async () => {
      const clienteA = await newClient('Claude da A');
      const clienteB = await newClient('Claude da B');
      await exchange(clienteA, issued(SUB_A));
      const deB = issued(SUB_B);
      await exchange(clienteB, deB);
      const old = await makeOld(clienteB);

      // B renova o próprio token mandando o client_id do app da A.
      await refresh(deB.refresh_token, issued(SUB_B), clienteA);

      expect((await connectionsOf(clienteA)).map((r) => r.userId)).toEqual([userA]);
      // A renovação conta para a conexão do refresh token, a de B no app de B.
      expect((await lastUsed(clienteB)).getTime()).toBeGreaterThan(old.getTime());
    });

    it('refresh token que não é de conexão nenhuma não cria nada', async () => {
      const before = await prisma.mcpOAuthConnection.count();
      const clientId = await newClient();

      await refresh(refreshToken(), issued(SUB_A), clientId);

      expect(await prisma.mcpOAuthConnection.count()).toBe(before);
    });

    it('token novo de outra pessoa não entra na conexão do refresh token', async () => {
      const clientId = await newClient('Claude');
      const deA = issued(SUB_A);
      await exchange(clientId, deA);

      const intruso = issued(SUB_B);
      await refresh(deA.refresh_token, intruso);

      const old = await makeOld(clientId);
      await service.touch(intruso.access_token);
      expect((await lastUsed(clientId)).getTime()).toBe(old.getTime());
      expect(await service.list(userB)).not.toContainEqual(
        expect.objectContaining({ clientName: 'Claude' }),
      );
    });
  });

  describe('toque do /mcp (último acesso)', () => {
    it('atualiza só a conexão do token que chamou', async () => {
      const claude = await newClient('Claude');
      const chatgpt = await newClient('ChatGPT');
      const deB = issued(SUB_B);
      await exchange(claude, issued(SUB_A));
      await exchange(chatgpt, deB);
      const old = await makeOld(claude);
      await makeOld(chatgpt);

      await service.touch(deB.access_token);

      expect((await lastUsed(chatgpt)).getTime()).toBeGreaterThan(old.getTime());
      expect((await lastUsed(claude)).getTime()).toBe(old.getTime());
    });

    it('não grava de novo dentro do intervalo', async () => {
      const clientId = await newClient('Claude');
      const tokens = issued(SUB_A);
      await exchange(clientId, tokens);
      const recent = new Date(Date.now() - 1_000);
      await prisma.mcpOAuthConnection.updateMany({
        where: { clientId },
        data: { lastUsedAt: recent },
      });

      await service.touch(tokens.access_token);

      expect((await lastUsed(clientId)).getTime()).toBe(recent.getTime());
    });

    it('access token vencido não marca acesso, e a próxima gravação o apaga', async () => {
      const clientId = await newClient('Claude');
      const tokens = issued(SUB_A);
      await exchange(clientId, tokens);
      await prisma.mcpOAuthConnectionToken.updateMany({
        where: { hash: hashToken(tokens.access_token) },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      const old = await makeOld(clientId);

      await service.touch(tokens.access_token);
      expect((await lastUsed(clientId)).getTime()).toBe(old.getTime());

      await refresh(tokens.refresh_token, issued(SUB_A));
      expect(
        await prisma.mcpOAuthConnectionToken.count({
          where: { hash: hashToken(tokens.access_token) },
        }),
      ).toBe(0);
    });

    it('token que não é de conexão nenhuma (o do próprio app) não faz nada nem lança', async () => {
      await expect(service.touch('token-do-pwa')).resolves.toBeUndefined();
      await expect(service.touch('')).resolves.toBeUndefined();
    });
  });

  it('lista da mais recente para a mais antiga', async () => {
    const velho = await newClient('Velho');
    const novo = await newClient('Novo');
    await exchange(velho, issued(SUB_B));
    await exchange(novo, issued(SUB_B));
    await prisma.mcpOAuthConnection.updateMany({
      where: { clientId: velho },
      data: { lastUsedAt: new Date('2026-01-01') },
    });

    const names = (await service.list(userB)).map((c) => c.clientName);
    expect(names.indexOf('Novo')).toBeLessThan(names.indexOf('Velho'));
  });
});

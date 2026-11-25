import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { API_KEY_PREFIX, hashApiKey, MAX_ACTIVE_KEYS, usageMonth } from '../api-key';
import { ApiCallRetention } from '../api-call-retention';
import { ApiKeyService } from '../api-key.service';
import { IntegrationReadService } from '../integration-read.service';

/**
 * Chaves de API da comunidade (#413, Pn-38 e Pn-38b), contra Postgres real. O
 * critério de pronto: a dona cria a chave "Zapier", usa a receita "Novo membro
 * → planilha" e vê a cota subir; no limite, as chamadas pausam e nada se perde.
 */
describe('chaves de API e cota do mês (integração, #413)', () => {
  const prisma = new PrismaService();
  const keys = new ApiKeyService(prisma);
  const read = new IntegrationReadService(prisma);

  const stamp = `t413k-${Date.now()}`;
  const usuarios: string[] = [];
  const u = { dono: '', admin: '', prof: '', ana: '', bia: '', donoB: '', caio: '' };
  let grupo = '';
  let grupoB = '';
  const DIA = 24 * 60 * 60 * 1000;
  /** O teto do mês vem do assento pago (decisão da revisão da #413), não do tipo. */
  const COM_ASSENTO = 10_000;
  const SEM_ASSENTO = 2_000;

  async function pessoa(nome: string) {
    const x = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${usuarios.length}`,
        email: `${stamp}-${usuarios.length}@test.local`,
        name: nome,
      },
    });
    usuarios.push(x.id);
    return x.id;
  }

  beforeAll(async () => {
    u.dono = await pessoa('Bruno Dono');
    u.admin = await pessoa('Rafael Admin');
    u.prof = await pessoa('Helena Prof');
    u.ana = await pessoa('Ana Aluna');
    u.bia = await pessoa('Bia Aluna');
    u.donoB = await pessoa('Dona B');
    u.caio = await pessoa('Caio de B');
    const g = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia 413 chaves',
        slug: `${stamp}-a`,
        ownerId: u.dono,
        timezone: 'America/Cuiaba',
        memberships: {
          create: [
            { userId: u.dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: u.admin, role: GroupRole.ADMIN, status: MembershipStatus.ACTIVE },
            { userId: u.prof, role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE },
          ],
        },
      },
    });
    grupo = g.id;
    const recepcao = await prisma.groupInvite.create({
      data: {
        groupId: grupo,
        tokenHash: `${stamp}-qr`,
        role: GroupRole.MEMBER,
        label: 'Recepção',
        origin: 'QR',
        uses: 1,
      },
    });
    await prisma.groupMembership.create({
      data: {
        groupId: grupo,
        userId: u.ana,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(Date.now() - 2 * DIA),
        joinVia: 'INVITE',
        joinedViaInviteId: recepcao.id,
        consentScopes: ['WORKOUT', 'BODY'],
      },
    });
    await prisma.groupMembership.create({
      data: {
        groupId: grupo,
        userId: u.bia,
        role: GroupRole.MEMBER,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(Date.now() - DIA),
        joinVia: 'CODE',
      },
    });
    // Convite por e-mail sem aceite há 3 dias: a receita do WhatsApp.
    await prisma.groupInvite.create({
      data: {
        groupId: grupo,
        tokenHash: `${stamp}-mail`,
        role: GroupRole.MEMBER,
        email: 'convidada@exemplo.com',
        expiresAt: new Date(Date.now() + 27 * DIA),
        createdAt: new Date(Date.now() - 3 * DIA),
        lastSentAt: new Date(Date.now() - 3 * DIA),
      },
    });
    // O que a equipe mandou e o que foi vendido.
    await prisma.planOffer.create({
      data: {
        userId: u.ana,
        authorId: u.prof,
        groupId: grupo,
        versions: {
          create: [
            {
              version: 1,
              title: 'Hipertrofia A/B',
              snapshot: {},
              snapshotVersion: 1,
              schedule: 'FLEXIBLE',
            },
          ],
        },
      },
    });
    await prisma.nutritionPlan.create({
      data: {
        userId: u.bia,
        authorId: u.prof,
        groupId: grupo,
        version: 1,
        kcalMin: 1800,
        kcalMax: 2000,
        proteinMinG: 100,
        proteinMaxG: 120,
        carbsMinG: 200,
        carbsMaxG: 240,
        fatMinG: 50,
        fatMaxG: 70,
      },
    });
    const oferta = await prisma.groupOffer.create({
      data: {
        groupId: grupo,
        slug: `${stamp}-verao`,
        title: 'Programa Verão',
        priceCents: 9900,
        status: 'ACTIVE',
      },
    });
    await prisma.groupOfferPurchase.createMany({
      data: [
        {
          offerId: oferta.id,
          buyerName: 'Duda Compradora',
          buyerEmail: 'duda@exemplo.com',
          amountCents: 9900,
          status: 'PAID',
          paidAt: new Date(),
        },
        {
          offerId: oferta.id,
          buyerName: 'Edu Pendente',
          buyerEmail: 'edu@exemplo.com',
          amountCents: 9900,
          status: 'PENDING',
        },
      ],
    });

    const b = await prisma.group.create({
      data: {
        type: GroupType.SOCIAL,
        name: 'Comunidade B 413 chaves',
        slug: `${stamp}-b`,
        ownerId: u.donoB,
        memberships: {
          create: [
            { userId: u.donoB, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            { userId: u.caio, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
          ],
        },
      },
    });
    grupoB = b.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: [grupo, grupoB] } } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  let segredo = '';
  let chaveId = '';

  describe('gestão das chaves', () => {
    it('a dona cria a chave "Zapier": o segredo aparece uma vez, o banco guarda o hash', async () => {
      const criada = await keys.create(u.dono, grupo, { name: '  Zapier ' });
      segredo = criada.secret;
      chaveId = criada.key.id;
      expect(segredo.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(criada.key).toMatchObject({
        name: 'Zapier',
        lastFour: segredo.slice(-4),
        scopes: ['INVITES', 'MEMBERS', 'SENDS'],
        createdBy: 'Bruno Dono',
        revokedAt: null,
      });
      const linha = await prisma.groupApiKey.findUniqueOrThrow({ where: { id: chaveId } });
      expect(linha.hash).toBe(hashApiKey(segredo));
      expect(JSON.stringify(linha)).not.toContain(segredo.slice(API_KEY_PREFIX.length));
      // A lista nunca devolve o segredo nem o hash.
      const lista = await keys.list(u.dono, grupo);
      expect(JSON.stringify(lista)).not.toContain(linha.hash);
      expect(JSON.stringify(lista)).not.toContain(segredo);
      expect(lista.keys.map((k) => k.name)).toEqual(['Zapier']);
    });

    it('só a dona: admin e profissional recebem 403, quem é de fora 404', async () => {
      for (const quem of [u.admin, u.prof]) {
        await expect(keys.list(quem, grupo)).rejects.toThrow(ForbiddenException);
        await expect(keys.create(quem, grupo, { name: 'x' })).rejects.toThrow(ForbiddenException);
        await expect(keys.revoke(quem, grupo, chaveId)).rejects.toThrow(ForbiddenException);
      }
      await expect(keys.list(u.donoB, grupo)).rejects.toThrow(NotFoundException);
      await expect(keys.revoke(u.donoB, grupoB, chaveId)).rejects.toThrow(NotFoundException);
    });

    it(`no máximo ${MAX_ACTIVE_KEYS} chaves ativas`, async () => {
      const extras: string[] = [];
      for (let i = 1; i < MAX_ACTIVE_KEYS; i++) {
        extras.push((await keys.create(u.dono, grupo, { name: `extra ${i}` })).key.id);
      }
      await expect(keys.create(u.dono, grupo, { name: 'uma a mais' })).rejects.toThrow(
        HttpException,
      );
      for (const id of extras) await keys.revoke(u.dono, grupo, id);
      expect((await keys.list(u.dono, grupo)).keys).toHaveLength(1);
    });
  });

  describe('a receita "Novo membro → planilha"', () => {
    it('a chave lê os membros com nome, papel, origem e data, e a cota sobe', async () => {
      const ctx = await keys.authenticate(segredo);
      expect(ctx).toMatchObject({ groupId: grupo, keyId: chaveId });
      const antes = (await keys.quota(grupo)).used;
      await keys.consume(ctx, 'MEMBERS', 'members');
      const { items } = await read.members(ctx, {});
      expect((await keys.quota(grupo)).used).toBe(antes + 1);

      const ana = items.find((i) => i.name === 'Ana Aluna');
      expect(ana).toEqual({
        id: expect.any(String),
        name: 'Ana Aluna',
        role: 'MEMBER',
        joinedAt: expect.any(Date),
        via: 'INVITE',
        origin: 'QR',
        label: 'Recepção',
      });
      expect(items.find((i) => i.name === 'Bia Aluna')).toMatchObject({ via: 'CODE' });
      // Mais recente primeiro, e nada de dado de saúde nem de consentimento.
      expect(items[0]!.name).toBe('Bia Aluna');
      expect(JSON.stringify(items)).not.toMatch(/consent|WORKOUT|BODY|email/i);
    });

    it('"since" traz só quem entrou depois (o gatilho do Zapier)', async () => {
      const ctx = await keys.authenticate(segredo);
      const { items } = await read.members(ctx, { since: new Date(Date.now() - 1.5 * DIA) });
      expect(items.map((i) => i.name)).toEqual(['Bia Aluna']);
    });

    it('o uso por chave fica 90 dias', async () => {
      const velha = await prisma.groupApiCall.create({
        data: {
          groupId: grupo,
          keyId: chaveId,
          endpoint: 'members',
          at: new Date(Date.now() - 91 * DIA),
        },
      });
      await new ApiCallRetention(prisma).purge(new Date());
      expect(await prisma.groupApiCall.findUnique({ where: { id: velha.id } })).toBeNull();
      expect(await prisma.groupApiCall.count({ where: { keyId: chaveId } })).toBeGreaterThan(0);
    });

    it('a chave registra o uso: a rota, a hora e o "último uso"', async () => {
      const chamadas = await prisma.groupApiCall.findMany({ where: { keyId: chaveId } });
      expect(chamadas.map((c) => c.endpoint)).toContain('members');
      const k = (await keys.list(u.dono, grupo)).keys[0]!;
      expect(k.lastUsedAt).not.toBeNull();
      expect(k.callsThisMonth).toBeGreaterThanOrEqual(1);
    });
  });

  describe('convites e envios', () => {
    it('convite sem aceite há 2 dias (a receita do WhatsApp)', async () => {
      const ctx = await keys.authenticate(segredo);
      const { items } = await read.invites(ctx, { pending: true });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        email: 'convidada@exemplo.com',
        role: 'MEMBER',
        kind: 'email',
        status: 'active',
        pending: true,
      });
      const todos = await read.invites(ctx, {});
      expect(todos.items.length).toBe(2);
    });

    it('pendente com `since`: o convite de 1 hora não volta como pendente', async () => {
      const ctx = await keys.authenticate(segredo);
      const recente = await prisma.groupInvite.create({
        data: {
          groupId: grupo,
          tokenHash: `${stamp}-mail-recente`,
          role: GroupRole.MEMBER,
          email: 'recente@exemplo.com',
          expiresAt: new Date(Date.now() + 27 * DIA),
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      try {
        const { items } = await read.invites(ctx, {
          pending: true,
          since: new Date(Date.now() - 4 * DIA),
        });
        expect(items.map((i) => i.email)).toEqual(['convidada@exemplo.com']);
      } finally {
        await prisma.groupInvite.delete({ where: { id: recente.id } });
      }
    });

    it('envios: planos mandados e programas vendidos (pagos), sem as faixas do plano', async () => {
      const ctx = await keys.authenticate(segredo);
      const { items } = await read.sends(ctx, {});
      // Plano alimentar de uma pessoa beira dado de saúde: a chave não lê (#413).
      expect(items.map((i) => i.kind).sort()).toEqual(['PROGRAM_SALE', 'WORKOUT_PLAN']);
      expect(items.find((i) => i.kind === 'WORKOUT_PLAN')).toMatchObject({
        title: 'Hipertrofia A/B',
        name: 'Ana Aluna',
        email: null,
        status: 'SENT',
      });
      expect(items.find((i) => i.kind === 'PROGRAM_SALE')).toMatchObject({
        title: 'Programa Verão',
        name: 'Duda Compradora',
        email: 'duda@exemplo.com',
        status: 'PAID',
      });
      expect(JSON.stringify(items)).not.toMatch(/1800|2000|kcal|Edu Pendente/);
      const vendas = await read.sends(ctx, { kind: 'PROGRAM_SALE' });
      expect(vendas.items).toHaveLength(1);
    });

    it('chave só com Membros não lê convites nem envios', async () => {
      const { secret } = await keys.create(u.dono, grupo, {
        name: 'Planilha',
        scopes: ['MEMBERS'],
      });
      const ctx = await keys.authenticate(secret);
      await expect(keys.consume(ctx, 'INVITES', 'invites')).rejects.toThrow(ForbiddenException);
      await expect(keys.consume(ctx, 'SENDS', 'sends')).rejects.toThrow(ForbiddenException);
      await keys.consume(ctx, 'MEMBERS', 'members');
      await keys.revoke(u.dono, grupo, ctx.keyId);
    });
  });

  describe('teto do mês pelo assento pago', () => {
    it('patrocinada sem assento valendo tem o teto menor; com assento ativo, o maior', async () => {
      expect((await keys.quota(grupo)).limit).toBe(SEM_ASSENTO);
      await prisma.groupSeatPool.create({
        data: { groupId: grupo, seats: 5, unitPriceCents: 1490, status: 'ACTIVE' },
      });
      expect((await keys.quota(grupo)).limit).toBe(COM_ASSENTO);
      // Vale o que se paga, não o tipo que a dona escolhe: a social sem assento fica no menor.
      const b = await keys.quota(grupoB);
      expect(b.limit).toBe(SEM_ASSENTO);
    });
  });

  describe('cota no limite (Pn-38b)', () => {
    it('no limite, as chamadas pausam até a renovação e nada se perde', async () => {
      const ctx = await keys.authenticate(segredo);
      const mes = usageMonth(new Date(), 'America/Cuiaba');
      const teto = COM_ASSENTO;
      await prisma.groupApiMonthUsage.update({
        where: { groupId_month: { groupId: grupo, month: mes } },
        data: { calls: teto - 1 },
      });
      expect((await keys.quota(grupo)).state).toBe('near');
      await keys.consume(ctx, 'MEMBERS', 'members');
      const err = await keys.consume(ctx, 'MEMBERS', 'members').catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const q = await keys.quota(grupo);
      expect(q).toMatchObject({ used: teto, limit: teto, state: 'limit' });
      expect(q.renewsOn).toMatch(/^\d{4}-\d{2}-01$/);
      // Nada no app muda: os membros continuam lá.
      expect(
        await prisma.groupMembership.count({ where: { groupId: grupo, status: 'ACTIVE' } }),
      ).toBe(5);
      await prisma.groupApiMonthUsage.update({
        where: { groupId_month: { groupId: grupo, month: mes } },
        data: { calls: 10 },
      });
    });

    it('concorrência não passa do teto', async () => {
      const ctx = await keys.authenticate(segredo);
      const mes = usageMonth(new Date(), 'America/Cuiaba');
      const teto = COM_ASSENTO;
      await prisma.groupApiMonthUsage.update({
        where: { groupId_month: { groupId: grupo, month: mes } },
        data: { calls: teto - 3 },
      });
      const r = await Promise.allSettled(
        Array.from({ length: 10 }, () => keys.consume(ctx, 'MEMBERS', 'members')),
      );
      expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(3);
      expect((await keys.quota(grupo)).used).toBe(teto);
      await prisma.groupApiMonthUsage.update({
        where: { groupId_month: { groupId: grupo, month: mes } },
        data: { calls: 10 },
      });
    });
  });

  describe('revogar e apagar', () => {
    it('a chave da A só enxerga a A', async () => {
      const ctx = await keys.authenticate(segredo);
      const { items } = await read.members(ctx, { limit: 100 });
      expect(items.map((i) => i.name)).not.toContain('Caio de B');
    });

    it('revogar tem efeito na próxima chamada', async () => {
      const revogada = await keys.revoke(u.dono, grupo, chaveId);
      expect(revogada.revokedAt).not.toBeNull();
      await expect(keys.authenticate(segredo)).rejects.toThrow(UnauthorizedException);
      expect((await keys.list(u.dono, grupo)).keys).toEqual([]);
    });

    it('segredo inventado, vazio ou de outro formato: 401', async () => {
      for (const raw of [null, '', 'qualquer', `${API_KEY_PREFIX}${'x'.repeat(32)}`]) {
        await expect(keys.authenticate(raw)).rejects.toThrow(UnauthorizedException);
      }
    });

    it('apagar a comunidade leva as chaves junto', async () => {
      const { secret } = await keys.create(u.donoB, grupoB, { name: 'Make' });
      await keys.authenticate(secret);
      await prisma.group.delete({ where: { id: grupoB } });
      await expect(keys.authenticate(secret)).rejects.toThrow(UnauthorizedException);
      expect(await prisma.groupApiKey.count({ where: { groupId: grupoB } })).toBe(0);
    });
  });
});

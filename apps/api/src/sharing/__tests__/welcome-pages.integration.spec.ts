import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { WelcomeService } from '../welcome.service';

/**
 * Páginas de boas-vindas da comunidade (#410, Pn-23 e Onb-02b): a equipe que
 * publica conteúdo escreve de 1 a 3 páginas e publica o conjunto; quem chega
 * pelo convite vê as páginas (se "Mostrar ao entrar" estiver ligado) e o
 * membro relê em Sobre. Tudo amarrado ao `groupId` da URL.
 */
describe('boas-vindas da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const groups = new GroupService(prisma, links, []);
  const email = { send: async () => true } as unknown as EmailService;
  const config = {
    get: (k: string) =>
      k === 'INVITE_LINK_SECRET'
        ? 'segredo-de-teste-410-com-variedade-AB12'
        : 'https://fatia.test/',
  } as unknown as ConfigService;
  const invites = new InviteService(prisma, memberships, email, config, silentNotifications);
  const welcome = new WelcomeService(prisma);

  const stamp = `t410-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona Ana');
    const g = await groups.create(dono, {
      type: 'SPONSORED',
      name: `Academia Demo ${n}`,
      joinPolicy: 'APPROVAL',
      visibility: 'PRIVATE',
    });
    grupos.push(g.id);
    const add = async (nome: string, role: 'MEMBER' | 'PROFESSIONAL' | 'RECEPTION' | 'ADMIN') => {
      const id = await pessoa(nome);
      await prisma.groupMembership.create({
        data: { groupId: g.id, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
      });
      return id;
    };
    const helena = await add('Helena', 'PROFESSIONAL');
    const aluna = await add('Carla', 'MEMBER');
    const recepcao = await add('Rita', 'RECEPTION');
    return { dono, helena, aluna, recepcao, groupId: g.id };
  }

  const combinados = {
    kind: 'PLAIN' as const,
    title: 'Combinados da casa',
    body: '- Seg a sex, 6h às 22h\n- Traga toalha e garrafa',
    showTeam: false,
  };
  const capa = {
    kind: 'COVER' as const,
    title: 'Bem-vinda à Academia Demo',
    body: 'Treino e companhia desde 2012.',
    showTeam: false,
  };

  async function convite(dono: string, groupId: string) {
    const c = await invites.create(dono, groupId, { role: 'MEMBER' });
    return new URL(c.url).pathname.replace(/^\/c\//, '');
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('sem páginas: o editor começa vazio, em rascunho, com "Mostrar ao entrar" ligado', async () => {
    const { dono, groupId } = await comunidade();
    expect(await welcome.editor(dono, groupId)).toEqual({
      pages: [],
      publishedAt: null,
      showOnJoin: true,
    });
  });

  it('a dona salva o rascunho na ordem; o aluno ainda não vê nada', async () => {
    const { dono, aluna, groupId } = await comunidade();
    const salvo = await welcome.save(dono, groupId, {
      pages: [capa, combinados],
      showOnJoin: true,
      published: false,
    });
    expect(salvo.publishedAt).toBeNull();
    expect(salvo.pages).toEqual([
      { position: 1, ...capa },
      { position: 2, ...combinados },
    ]);
    expect((await welcome.forMember(aluna, groupId)).pages).toEqual([]);
    const token = await convite(dono, groupId);
    expect((await invites.preview(token)).welcome).toEqual([]);
  });

  it('publicada: o convite e o Sobre mostram as páginas, com os nomes da equipe', async () => {
    const { dono, aluna, groupId } = await comunidade();
    const pub = await welcome.save(dono, groupId, {
      pages: [combinados, { ...capa, kind: 'PLAIN', title: 'A Helena revisa', showTeam: true }],
      showOnJoin: true,
      published: true,
    });
    expect(pub.publishedAt).toBeInstanceOf(Date);

    const token = await convite(dono, groupId);
    const preview = await invites.preview(token);
    expect(preview.welcome.map((p) => p.title)).toEqual(['Combinados da casa', 'A Helena revisa']);

    const sobre = await welcome.forMember(aluna, groupId);
    expect(sobre.pages).toHaveLength(2);
    expect(sobre.team.map((t) => t.name).sort()).toEqual(['Dona Ana', 'Helena']);
    // Só a equipe que recebe: aluna e recepção não aparecem.
    expect(JSON.stringify(sobre.team)).not.toMatch(/Carla|Rita/);
  });

  it('"Mostrar ao entrar" desligado: o convite não traz as páginas, o Sobre continua', async () => {
    const { dono, aluna, groupId } = await comunidade();
    await welcome.save(dono, groupId, { pages: [combinados], showOnJoin: false, published: true });
    const token = await convite(dono, groupId);
    expect((await invites.preview(token)).welcome).toEqual([]);
    expect((await welcome.forMember(aluna, groupId)).pages).toHaveLength(1);
  });

  it('republicar mantém a data da primeira publicação; voltar a rascunho tira do ar', async () => {
    const { dono, aluna, groupId } = await comunidade();
    const a = await welcome.save(dono, groupId, {
      pages: [combinados],
      showOnJoin: true,
      published: true,
    });
    const b = await welcome.save(dono, groupId, {
      pages: [{ ...combinados, title: 'Combinados' }],
      showOnJoin: true,
      published: true,
    });
    expect(b.publishedAt).toEqual(a.publishedAt);
    expect((await welcome.forMember(aluna, groupId)).pages[0]?.title).toBe('Combinados');
    const c = await welcome.save(dono, groupId, {
      pages: [combinados],
      showOnJoin: true,
      published: false,
    });
    expect(c.publishedAt).toBeNull();
    expect((await welcome.forMember(aluna, groupId)).pages).toEqual([]);
  });

  it('valida no servidor: até 3 páginas, texto até 300, título não vazio, publicar exige página', async () => {
    const { dono, groupId } = await comunidade();
    const bad = (pages: (typeof combinados)[], published = false) =>
      welcome.save(dono, groupId, { pages, showOnJoin: true, published });
    await expect(bad([combinados, combinados, combinados, combinados])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bad([{ ...combinados, body: 'a'.repeat(301) }])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bad([{ ...combinados, title: '   ' }])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bad([], true)).rejects.toBeInstanceOf(BadRequestException);
    // 300 caracteres contados como o aluno vê: emoji conta 1.
    const ok = await bad([{ ...combinados, body: '💪'.repeat(300) }]);
    expect(ok.pages[0]?.body).toHaveLength(600);
    // Nada salvo pelas tentativas recusadas.
    expect(await prisma.groupWelcomePage.count({ where: { groupId } })).toBe(1);
  });

  it('texto vira texto puro: \\r\\n normaliza, espaços das pontas saem', async () => {
    const { dono, groupId } = await comunidade();
    const s = await welcome.save(dono, groupId, {
      pages: [{ ...combinados, title: '  Combinados  ', body: '- um\r\n- dois  \r\n' }],
      showOnJoin: true,
      published: false,
    });
    expect(s.pages[0]).toMatchObject({ title: 'Combinados', body: '- um\n- dois' });
  });

  it('sem páginas de novo: volta ao padrão do Fatia e despublica', async () => {
    const { dono, groupId } = await comunidade();
    await welcome.save(dono, groupId, { pages: [combinados], showOnJoin: true, published: true });
    const s = await welcome.save(dono, groupId, { pages: [], showOnJoin: true, published: false });
    expect(s).toEqual({ pages: [], publishedAt: null, showOnJoin: true });
  });

  it('só quem publica conteúdo edita: membro e recepção 403; quem é de fora 404', async () => {
    const { dono, helena, aluna, recepcao, groupId } = await comunidade();
    const input = { pages: [combinados], showOnJoin: true, published: true };
    await expect(welcome.save(aluna, groupId, input)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(welcome.save(recepcao, groupId, input)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(welcome.editor(aluna, groupId)).rejects.toBeInstanceOf(ForbiddenException);
    // O profissional publica conteúdo (content.publish).
    await expect(welcome.save(helena, groupId, input)).resolves.toMatchObject({
      pages: [expect.objectContaining({ title: 'Combinados da casa' })],
    });
    const outra = await comunidade();
    await expect(welcome.save(outra.dono, groupId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(welcome.forMember(outra.aluna, groupId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(welcome.editor(dono, outra.groupId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('apagar a comunidade apaga as páginas', async () => {
    const { dono, groupId } = await comunidade();
    await welcome.save(dono, groupId, { pages: [combinados], showOnJoin: true, published: true });
    await prisma.group.delete({ where: { id: groupId } });
    expect(await prisma.groupWelcomePage.count({ where: { groupId } })).toBe(0);
  });

  // --- review do PR #469 ----------------------------------------------------

  it('salvar ao mesmo tempo (duas abas, retry) nunca vira 500: todos passam, o último vale', async () => {
    const { dono, groupId } = await comunidade();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, k) =>
        welcome.save(dono, groupId, {
          pages: [
            { ...combinados, title: `A${k}` },
            { ...combinados, title: `B${k}` },
          ],
          showOnJoin: true,
          published: false,
        }),
      ),
    );
    const erros = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(
        (r) =>
          `${(r.reason as Error)?.constructor?.name}: ${(r.reason as { code?: string })?.code ?? ''}`,
      );
    expect(erros).toEqual([]);
    const final = await welcome.editor(dono, groupId);
    expect(final.pages).toHaveLength(2);
    // As duas páginas são do mesmo salvamento, nunca misturadas.
    expect(final.pages[0]?.title.slice(1)).toBe(final.pages[1]?.title.slice(1));
  });

  it('emoji com tom de pele ou família conta 1: 300 cabem, 301 não', async () => {
    const { dono, groupId } = await comunidade();
    const save = (body: string) =>
      welcome.save(dono, groupId, {
        pages: [{ ...combinados, body }],
        showOnJoin: true,
        published: false,
      });
    await expect(save('👍🏽'.repeat(300))).resolves.toBeDefined();
    await expect(save('👨‍👩‍👧'.repeat(300))).resolves.toBeDefined();
    await expect(save('👍🏽'.repeat(301))).rejects.toBeInstanceOf(BadRequestException);
    // Título: 80 visíveis com tom de pele cabem.
    await expect(
      welcome.save(dono, groupId, {
        pages: [{ ...combinados, title: '👍🏽'.repeat(80) }],
        showOnJoin: true,
        published: false,
      }),
    ).resolves.toBeDefined();
  });

  it('acima do teto do banco é 400 antes de chegar ao Postgres', async () => {
    const { dono, groupId } = await comunidade();
    // Um caractere visível com 2000 acentos combinados: 1 grafema, 2001 pontos de código.
    const zalgo = 'a' + '\u0301'.repeat(2000);
    const err = await welcome
      .save(dono, groupId, {
        pages: [{ ...combinados, body: zalgo }],
        showOnJoin: true,
        published: false,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    const errTitle = await welcome
      .save(dono, groupId, {
        pages: [{ ...combinados, title: 'a' + '\u0301'.repeat(600) }],
        showOnJoin: true,
        published: false,
      })
      .catch((e: unknown) => e);
    expect(errTitle).toBeInstanceOf(BadRequestException);
  });

  it('NUL e outros controles saem do título e do texto (nada de 500)', async () => {
    const { dono, groupId } = await comunidade();
    const s = await welcome.save(dono, groupId, {
      pages: [{ ...combinados, title: 'Oi\u0000 a\u0007ll', body: '- um\u0000\n- d\u001bois\t!' }],
      showOnJoin: true,
      published: false,
    });
    expect(s.pages[0]).toMatchObject({ title: 'Oi all', body: '- um\n- dois !' });
    // Título só de controles fica vazio: 400, não erro do banco.
    const err = await welcome
      .save(dono, groupId, {
        pages: [{ ...combinados, title: '\u0000\u0001' }],
        showOnJoin: true,
        published: false,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('o convite leva o avatar da comunidade para a capa (Onb-02b)', async () => {
    const { dono, groupId } = await comunidade();
    await welcome.save(dono, groupId, {
      pages: [capa],
      showOnJoin: true,
      published: true,
    });
    const preview = await invites.preview(await convite(dono, groupId));
    expect(preview.welcome).toHaveLength(1);
    // Sem foto: o campo existe e é nulo (a capa mostra as iniciais na cor da marca).
    expect(preview.group).toHaveProperty('avatarUrl', null);
  });
});

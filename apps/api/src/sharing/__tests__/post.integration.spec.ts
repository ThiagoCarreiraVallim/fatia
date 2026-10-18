import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PostReactionKind, ReportReason } from '@fatia/db';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { GroupService } from '../group.service';
import { InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { FEED_PAGE_SIZE, POST_REACTIONS, PostService, REPORT_REASONS } from '../post.service';
import { ProfessionalLinkService } from '../professional-link.service';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * O mural da comunidade (Fase 8b, ADR 032) no Postgres real: quem publica,
 * quem vê o quê, o isolamento pelo par da URL, a moderação e o banimento.
 */
describe('mural da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const posts = new PostService(prisma, media);
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links);
  const groups = new GroupService(prisma, links, [], media);
  const invites = new InviteService(
    prisma,
    memberships,
    { send: async () => true } as unknown as EmailService,
    { get: () => 'https://fatia.test/' } as unknown as ConfigService,
  );

  const stamp = `mural-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${nome} ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL' | 'CREATOR') {
    const id = await pessoa(role === 'MEMBER' ? 'Membro' : 'Equipe');
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia' });
    grupos.push(g.id);
    return {
      groupId: g.id,
      slug: g.slug,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      membro: await entra(g.id, 'MEMBER'),
      outro: await entra(g.id, 'MEMBER'),
    };
  }

  async function imagem(userId: string, groupId: string) {
    const r = await media.requestUpload(userId, {
      purpose: 'post_image',
      groupId,
      mime: 'image/png',
      bytes: PNG.length,
    });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(f.key, PNG, 'image/png');
    await media.confirm(userId, r.fileId);
    return r.fileId;
  }

  async function membershipDe(groupId: string, userId: string) {
    return prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
    });
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('reações e motivos do código são os enums do banco', () => {
    expect(Object.values(PostReactionKind)).toEqual([...POST_REACTIONS]);
    expect(Object.values(ReportReason)).toEqual([...REPORT_REASONS]);
  });

  describe('publicar', () => {
    it('membro publica com apelido e imagem; quem é de fora nem vê o mural', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const foto = await imagem(a.membro, a.groupId);

      const post = await posts.create(a.membro, a.groupId, {
        body: 'Primeiro treino da semana!',
        imageFileIds: [foto],
        displayName: 'Ana',
      });
      expect(post).toMatchObject({
        body: 'Primeiro treino da semana!',
        author: { displayName: 'Ana', team: false, isMe: true },
        canDelete: true,
        canModerate: false,
        pinned: false,
        removed: null,
      });
      expect(post.images).toHaveLength(1);
      expect(post.images[0]!.url).toMatch(/^memory:\/\/get\/groups\//);
      // O apelido vale para a comunidade toda (o mesmo dos desafios).
      expect((await membershipDe(a.groupId, a.membro)).displayName).toBe('Ana');

      const visto = await posts.list(a.outro, a.groupId);
      expect(visto.posts.map((p) => p.id)).toEqual([post.id]);
      expect(visto.posts[0]!.author).toEqual({ displayName: 'Ana', team: false, isMe: false });

      await expect(posts.list(estranho, a.groupId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(posts.create(estranho, a.groupId, { body: 'Oi' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sem apelido, o primeiro post usa o primeiro nome; a equipe tem o selo', async () => {
      const a = await comunidade();
      const post = await posts.create(a.prof, a.groupId, { body: 'Aula extra no sábado' });
      expect(post.author).toEqual({ displayName: 'Equipe', team: true, isMe: true });
    });

    it('post vazio, longo demais ou com imagem repetida é recusado', async () => {
      const a = await comunidade();
      await expect(posts.create(a.membro, a.groupId, { body: '   ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        posts.create(a.membro, a.groupId, { body: 'x'.repeat(2001) }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const foto = await imagem(a.membro, a.groupId);
      await expect(
        posts.create(a.membro, a.groupId, { imageFileIds: [foto, foto] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('imagem de outra comunidade, de outra pessoa ou já usada não entra no post', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const deB = await imagem(b.membro, b.groupId);
      await expect(
        posts.create(b.membro, a.groupId, { body: 'x', imageFileIds: [deB] }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const doOutro = await imagem(a.outro, a.groupId);
      await expect(
        posts.create(a.membro, a.groupId, { body: 'x', imageFileIds: [doOutro] }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const minha = await imagem(a.membro, a.groupId);
      await posts.create(a.membro, a.groupId, { body: 'x', imageFileIds: [minha] });
      await expect(
        posts.create(a.membro, a.groupId, { body: 'de novo', imageFileIds: [minha] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('só a equipe publica quando a política manda; o membro ainda comenta e reage', async () => {
      const a = await comunidade();
      await groups.update(a.dono, a.groupId, { postPolicy: 'TEAM_ONLY' });

      await expect(posts.create(a.membro, a.groupId, { body: 'Posso?' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // A imagem também não sobe: o bucket não guarda o que não vai virar post.
      await expect(
        media.requestUpload(a.membro, {
          purpose: 'post_image',
          groupId: a.groupId,
          mime: 'image/png',
          bytes: PNG.length,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const post = await posts.create(a.prof, a.groupId, { body: 'Recado da equipe' });
      expect((await posts.list(a.membro, a.groupId)).canPost).toBe(false);
      await posts.comment(a.membro, a.groupId, post.id, { body: 'Valeu!' });
      const reagido = await posts.react(a.membro, a.groupId, post.id, 'CLAP');
      expect(reagido.reactions).toEqual({
        counts: { STRONG: 0, FIRE: 0, CLAP: 1, HEART: 0 },
        mine: 'CLAP',
      });
    });
  });

  describe('ler', () => {
    it('pagina por cursor, com os fixados no topo da primeira página só', async () => {
      const a = await comunidade();
      const ids: string[] = [];
      for (let i = 0; i < FEED_PAGE_SIZE + 3; i++) {
        ids.push((await posts.create(a.membro, a.groupId, { body: `post ${i}` })).id);
      }
      await posts.moderatePost(a.dono, a.groupId, ids[0]!, 'pin');

      const p1 = await posts.list(a.outro, a.groupId);
      expect(p1.posts[0]).toMatchObject({ id: ids[0], pinned: true });
      expect(p1.posts).toHaveLength(FEED_PAGE_SIZE + 1);
      expect(p1.nextCursor).not.toBeNull();

      const p2 = await posts.list(a.outro, a.groupId, p1.nextCursor);
      expect(p2.nextCursor).toBeNull();
      const todos = [...p1.posts, ...p2.posts].map((p) => p.id);
      expect(new Set(todos).size).toBe(ids.length);
      expect(todos).toHaveLength(ids.length);
    });

    it('cursor e post de outra comunidade não valem aqui', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const deB = await posts.create(b.membro, b.groupId, { body: 'de lá' });
      await expect(posts.list(a.membro, a.groupId, deB.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(posts.get(a.membro, a.groupId, deB.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(posts.react(a.membro, a.groupId, deB.id, 'FIRE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        posts.comment(a.membro, a.groupId, deB.id, { body: 'oi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        posts.report(a.membro, a.groupId, deB.id, { reason: 'SPAM' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(posts.moderatePost(a.dono, a.groupId, deB.id, 'remove')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('comentários e reações', () => {
    it('comentário aparece no detalhe e conta no post; só o autor apaga', async () => {
      const a = await comunidade();
      const post = await posts.create(a.membro, a.groupId, { body: 'Bora!' });
      const c = await posts.comment(a.outro, a.groupId, post.id, { body: 'Bora!!' });

      const detalhe = await posts.get(a.membro, a.groupId, post.id);
      expect(detalhe.commentCount).toBe(1);
      expect(detalhe.comments).toEqual([
        expect.objectContaining({ id: c.id, body: 'Bora!!', canDelete: false }),
      ]);
      await expect(posts.deleteComment(a.membro, a.groupId, post.id, c.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await posts.deleteComment(a.outro, a.groupId, post.id, c.id);
      expect((await posts.get(a.membro, a.groupId, post.id)).comments).toEqual([]);
    });

    it('uma reação por pessoa: trocar troca, tirar tira', async () => {
      const a = await comunidade();
      const post = await posts.create(a.membro, a.groupId, { body: 'x' });
      await posts.react(a.outro, a.groupId, post.id, 'FIRE');
      const trocado = await posts.react(a.outro, a.groupId, post.id, 'HEART');
      expect(trocado.reactions.counts).toMatchObject({ FIRE: 0, HEART: 1 });
      const tirado = await posts.react(a.outro, a.groupId, post.id, null);
      expect(tirado.reactions).toMatchObject({ mine: null, counts: { HEART: 0 } });
    });
  });

  describe('apagar', () => {
    it('o autor apaga o post e as imagens somem do bucket; outro membro não apaga', async () => {
      const a = await comunidade();
      const foto = await imagem(a.membro, a.groupId);
      const post = await posts.create(a.membro, a.groupId, { body: 'x', imageFileIds: [foto] });
      const arquivo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: foto } });

      await expect(posts.remove(a.outro, a.groupId, post.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Moderar não é apagar: a dona remove pela moderação.
      await expect(posts.remove(a.dono, a.groupId, post.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      await posts.remove(a.membro, a.groupId, post.id);
      expect(await prisma.groupPost.findUnique({ where: { id: post.id } })).toBeNull();
      expect(await prisma.mediaFile.findUnique({ where: { id: foto } })).toBeNull();
      expect(store.objects.has(arquivo.key)).toBe(false);
    });
  });

  describe('moderação', () => {
    it('removido some para todos menos o autor, que vê o motivo e as imagens', async () => {
      const a = await comunidade();
      const foto = await imagem(a.membro, a.groupId);
      const post = await posts.create(a.membro, a.groupId, {
        body: 'compre já',
        imageFileIds: [foto],
      });

      await posts.moderatePost(a.dono, a.groupId, post.id, 'remove', 'SPAM');

      expect((await posts.list(a.outro, a.groupId)).posts).toEqual([]);
      await expect(posts.get(a.outro, a.groupId, post.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(posts.react(a.outro, a.groupId, post.id, 'FIRE')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const doAutor = await posts.list(a.membro, a.groupId);
      expect(doAutor.posts).toEqual([
        expect.objectContaining({ id: post.id, removed: { reason: 'SPAM' }, pinned: false }),
      ]);
      expect(doAutor.posts[0]!.images).toHaveLength(1);
      // A moderação vê só o texto, na lista de removidos, e pode desfazer.
      expect(await posts.removed(a.dono, a.groupId)).toEqual([
        expect.objectContaining({ id: post.id, images: 1, reason: 'SPAM' }),
      ]);
      await posts.moderatePost(a.dono, a.groupId, post.id, 'restore');
      expect((await posts.list(a.outro, a.groupId)).posts.map((p) => p.id)).toEqual([post.id]);
    });

    it('membro e profissional não moderam; criador modera', async () => {
      const a = await comunidade();
      const criador = await entra(a.groupId, 'CREATOR');
      const post = await posts.create(a.membro, a.groupId, { body: 'x' });
      for (const quem of [a.outro, a.prof]) {
        await expect(posts.moderatePost(quem, a.groupId, post.id, 'remove')).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        await expect(posts.reports(quem, a.groupId)).rejects.toBeInstanceOf(ForbiddenException);
      }
      await posts.moderatePost(criador, a.groupId, post.id, 'pin');
      expect((await posts.list(a.outro, a.groupId)).posts[0]).toMatchObject({ pinned: true });
    });

    it('fixa até 3', async () => {
      const a = await comunidade();
      const ids = [];
      for (let i = 0; i < 4; i++)
        ids.push((await posts.create(a.prof, a.groupId, { body: `${i}` })).id);
      for (const id of ids.slice(0, 3)) await posts.moderatePost(a.dono, a.groupId, id, 'pin');
      await expect(posts.moderatePost(a.dono, a.groupId, ids[3]!, 'pin')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('denúncia: anônima, sem duplicar, e resolver resolve todas do alvo', async () => {
      const a = await comunidade();
      const terceiro = await entra(a.groupId, 'MEMBER');
      const post = await posts.create(a.membro, a.groupId, { body: 'ofensa' });

      await expect(
        posts.report(a.membro, a.groupId, post.id, { reason: 'SPAM' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await posts.report(a.outro, a.groupId, post.id, { reason: 'OFFENSIVE', note: 'pesado' });
      await posts.report(a.outro, a.groupId, post.id, { reason: 'OFFENSIVE' });
      await posts.report(terceiro, a.groupId, post.id, { reason: 'HARASSMENT' });

      const fila = await posts.reports(a.dono, a.groupId);
      expect(fila).toEqual([
        expect.objectContaining({
          postId: post.id,
          commentId: null,
          count: 2,
          reasons: { OFFENSIVE: 1, HARASSMENT: 1 },
          notes: ['pesado'],
          excerpt: 'ofensa',
        }),
      ]);
      // Ninguém da equipe sabe quem denunciou.
      expect(JSON.stringify(fila)).not.toContain((await membershipDe(a.groupId, a.outro)).id);

      await posts.resolveReport(a.dono, a.groupId, fila[0]!.reportId, 'remove');
      expect(await posts.reports(a.dono, a.groupId)).toEqual([]);
      const removido = await prisma.groupPost.findUniqueOrThrow({ where: { id: post.id } });
      expect(removido.removedAt).not.toBeNull();
      expect(removido.removedReason).toBe('OFFENSIVE');
    });

    it('denúncia de comentário remove só o comentário; descartar mantém', async () => {
      const a = await comunidade();
      const post = await posts.create(a.membro, a.groupId, { body: 'ok' });
      const c = await posts.comment(a.outro, a.groupId, post.id, { body: 'ruim' });
      const c2 = await posts.comment(a.outro, a.groupId, post.id, { body: 'normal' });
      await posts.report(a.membro, a.groupId, post.id, { reason: 'OFFENSIVE', commentId: c.id });
      await posts.report(a.membro, a.groupId, post.id, { reason: 'SPAM', commentId: c2.id });

      const fila = await posts.reports(a.dono, a.groupId);
      const ruim = fila.find((f) => f.commentId === c.id)!;
      const normal = fila.find((f) => f.commentId === c2.id)!;
      await posts.resolveReport(a.dono, a.groupId, ruim.reportId, 'remove');
      await posts.resolveReport(a.dono, a.groupId, normal.reportId, 'dismiss');

      const visto = await posts.get(a.membro, a.groupId, post.id);
      expect(visto.comments.map((x) => x.body)).toEqual(['normal']);
      expect(visto.removed).toBeNull();
      // O autor do comentário removido ainda o vê.
      const doAutor = await posts.get(a.outro, a.groupId, post.id);
      expect(doAutor.comments).toEqual([
        expect.objectContaining({ id: c.id, removed: true }),
        expect.objectContaining({ id: c2.id, removed: false }),
      ]);
    });

    it('denúncia de outra comunidade não se resolve aqui', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const post = await posts.create(b.membro, b.groupId, { body: 'x' });
      await posts.report(b.outro, b.groupId, post.id, { reason: 'SPAM' });
      const [item] = await posts.reports(b.dono, b.groupId);
      // As duas ações: "remover" ainda passaria pelo post, "manter" não tem segunda trava.
      for (const acao of ['remove', 'dismiss'] as const) {
        await expect(
          posts.resolveReport(a.dono, a.groupId, item!.reportId, acao),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(await posts.reports(b.dono, b.groupId)).toHaveLength(1);
    });
  });

  describe('banimento', () => {
    it('banido sai, perde o acesso e não volta pelo código nem por convite', async () => {
      const a = await comunidade();
      await groups.update(a.dono, a.groupId, { joinPolicy: 'OPEN' });
      const alvo = await membershipDe(a.groupId, a.membro);

      await expect(memberships.ban(a.prof, a.groupId, alvo.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await memberships.ban(a.dono, a.groupId, alvo.id);

      await expect(posts.list(a.membro, a.groupId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(memberships.requestJoin(a.membro, a.slug)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const { url } = await invites.create(a.dono, a.groupId, { role: 'MEMBER' });
      await expect(
        invites.accept(a.membro, url.split('/c/')[1]!, { scopes: [], statsOptIn: false }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await memberships.listBanned(a.dono, a.groupId)).toEqual([
        expect.objectContaining({ membershipId: alvo.id }),
      ]);

      // Desbanir não põe de volta: só deixa entrar de novo.
      await memberships.unban(a.dono, a.groupId, alvo.id);
      expect((await membershipDe(a.groupId, a.membro)).status).toBe('REMOVED');
      await memberships.requestJoin(a.membro, a.slug);
      expect((await membershipDe(a.groupId, a.membro)).status).toBe('ACTIVE');
    });

    it('não se bane o dono nem gente de outra comunidade', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const donoA = await membershipDe(a.groupId, a.dono);
      const deB = await membershipDe(b.groupId, b.membro);
      await expect(memberships.ban(a.dono, a.groupId, donoA.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(memberships.ban(a.dono, a.groupId, deB.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect((await membershipDe(b.groupId, b.membro)).status).toBe('ACTIVE');
    });
  });

  describe('conta apagada', () => {
    it('apagar a conta leva posts, comentários, reações, denúncias e as imagens', async () => {
      const a = await comunidade();
      const foto = await imagem(a.membro, a.groupId);
      const arquivo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: foto } });
      const post = await posts.create(a.membro, a.groupId, { body: 'x', imageFileIds: [foto] });
      const outroPost = await posts.create(a.outro, a.groupId, { body: 'y' });
      await posts.comment(a.membro, a.groupId, outroPost.id, { body: 'z' });
      await posts.react(a.membro, a.groupId, outroPost.id, 'FIRE');
      await posts.report(a.membro, a.groupId, outroPost.id, { reason: 'SPAM' });

      await media.beforeDeleteAccount(a.membro);
      expect(store.objects.has(arquivo.key)).toBe(false);
      await prisma.user.delete({ where: { id: a.membro } });

      expect(await prisma.groupPost.findUnique({ where: { id: post.id } })).toBeNull();
      const restante = await posts.get(a.outro, a.groupId, outroPost.id);
      expect(restante.comments).toEqual([]);
      expect(restante.reactions.counts.FIRE).toBe(0);
      expect(await prisma.groupPostReport.count({ where: { postId: outroPost.id } })).toBe(0);
    });
  });
});

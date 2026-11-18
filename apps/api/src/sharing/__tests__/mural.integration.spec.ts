import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { Notice, NotificationService } from '../../notifications/notification.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { AnnouncementService } from '../announcement.service';
import { BlockService } from '../block.service';
import { publishAutoPost } from '../auto-post';
import { ForYouService } from '../for-you.service';
import { GroupService } from '../group.service';
import { MembershipService } from '../membership.service';
import { PostController } from '../post.controller';
import { POLL_MIN_VOTES, PostService } from '../post.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * O mural do redesign (#394) no Postgres real: bloqueio entre contas, ocultar,
 * filtros, avisos fixados com ordem e prazo, "posts novos", enquetes com voto
 * anônimo e mínimo de 5, e comunicados agendados e repetidos.
 */
describe('mural do redesign (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const enviados: { userIds: string[]; notice: Notice }[] = [];
  const agrupados: { userId: string; notice: Notice }[] = [];
  const notifications = {
    notify: (userIds: readonly string[], notice: Notice) =>
      enviados.push({ userIds: [...userIds], notice }),
    notifyGrouped: (userId: string, _key: string, notice: Notice) =>
      agrupados.push({ userId, notice }),
    drain: async () => undefined,
  } as unknown as NotificationService;
  const posts = new PostService(prisma, media, notifications);
  const blocks = new BlockService(prisma);
  const announcements = new AnnouncementService(prisma, posts, notifications);
  const forYou = new ForYouService(prisma);
  const links = new ProfessionalLinkService(prisma);
  const groups = new GroupService(prisma, links, [], media);
  const memberships = new MembershipService(prisma, links, notifications);

  const stamp = `mural394-${Date.now()}`;
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

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL' | 'CREATOR', id?: string) {
    const userId = id ?? (await pessoa(role === 'MEMBER' ? 'Membro' : 'Equipe'));
    await prisma.groupMembership.create({
      data: { groupId, userId, role, status: 'ACTIVE', joinedAt: new Date(Date.now() - 60_000) },
    });
    return userId;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: 'Academia Demo' });
    grupos.push(g.id);
    return {
      groupId: g.id,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      ana: await entra(g.id, 'MEMBER'),
      gabi: await entra(g.id, 'MEMBER'),
    };
  }

  beforeEach(() => {
    enviados.length = 0;
    agrupados.length = 0;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('bloquear pessoa', () => {
    it('comentário e reação num post em nome da comunidade não avisam quem tem bloqueio', async () => {
      const a = await comunidade();
      const doProf = await posts.create(a.prof, a.groupId, { body: 'Post do prof' });
      const daComunidade = await posts.create(a.prof, a.groupId, {
        body: 'Aviso geral',
        publishedAs: 'GROUP',
      });
      await blocks.block(a.ana, { groupId: a.groupId, postId: doProf.id });
      enviados.length = 0;
      agrupados.length = 0;

      // O post da comunidade continua visível para a Ana, mas o prof não fica sabendo dela.
      await posts.comment(a.ana, a.groupId, daComunidade.id, { body: 'Valeu' });
      await posts.react(a.ana, a.groupId, daComunidade.id, 'FIRE');
      const paraProf = [
        ...enviados.filter((e) => e.userIds.includes(a.prof)),
        ...agrupados.filter((e) => e.userId === a.prof),
      ];
      expect(paraProf).toEqual([]);

      // Sem bloqueio, o aviso sai normalmente.
      await posts.comment(a.gabi, a.groupId, daComunidade.id, { body: 'Show' });
      expect(
        [...enviados, ...agrupados.map((g) => ({ userIds: [g.userId] }))].some((e) =>
          e.userIds.includes(a.prof),
        ),
      ).toBe(true);
    });

    it('posts, comentários e reações somem dos dois lados, em todas as comunidades', async () => {
      const a = await comunidade();
      const b = await comunidade();
      await entra(b.groupId, 'MEMBER', a.ana);
      await entra(b.groupId, 'MEMBER', a.gabi);

      const daGabi = await posts.create(a.gabi, a.groupId, { body: 'Bati meu recorde!' });
      const daGabiEmB = await posts.create(a.gabi, b.groupId, { body: 'Oi, B' });
      const daAna = await posts.create(a.ana, a.groupId, { body: 'Post da Ana' });
      const doProf = await posts.create(a.prof, a.groupId, { body: 'Aula sábado' });
      await posts.comment(a.gabi, a.groupId, doProf.id, { body: 'Eu vou!' });
      await posts.comment(a.ana, a.groupId, doProf.id, { body: 'Eu também' });
      await posts.react(a.gabi, a.groupId, doProf.id, 'FIRE');
      await posts.react(a.ana, a.groupId, doProf.id, 'HEART');

      const bloqueio = await blocks.block(a.ana, { groupId: a.groupId, postId: daGabi.id });
      expect(bloqueio.label).toBe(daGabi.author.displayName);

      // Ana não vê nada da Gabi, em nenhuma comunidade.
      const muralA = await posts.list(a.ana, a.groupId);
      const ids = [...muralA.pins, ...muralA.posts].map((p) => p.id);
      expect(ids).not.toContain(daGabi.id);
      expect(ids).toContain(doProf.id);
      const muralB = await posts.list(a.ana, b.groupId);
      expect(muralB.posts.map((p) => p.id)).not.toContain(daGabiEmB.id);
      await expect(posts.get(a.ana, a.groupId, daGabi.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const detalhe = await posts.get(a.ana, a.groupId, doProf.id);
      expect(detalhe.comments.map((c) => c.body)).toEqual(['Eu também']);
      expect(detalhe.commentCount).toBe(1);
      expect(detalhe.reactions.counts.FIRE).toBe(0);
      expect(detalhe.reactions.counts.HEART).toBe(1);

      // E a Gabi também não vê a Ana (sem saber que foi bloqueada).
      const daGabiVisto = await posts.list(a.gabi, a.groupId);
      expect(daGabiVisto.posts.map((p) => p.id)).not.toContain(daAna.id);
      const pelaGabi = await posts.get(a.gabi, a.groupId, doProf.id);
      expect(pelaGabi.comments.map((c) => c.body)).toEqual(['Eu vou!']);
      expect(pelaGabi.reactions.counts.HEART).toBe(0);
      await expect(
        posts.comment(a.gabi, a.groupId, daAna.id, { body: 'oi' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(posts.react(a.gabi, a.groupId, daAna.id, 'FIRE')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Os outros continuam vendo tudo.
      const prof = await posts.get(a.prof, a.groupId, doProf.id);
      expect(prof.comments).toHaveLength(2);
      expect(prof.reactions.counts.FIRE + prof.reactions.counts.HEART).toBe(2);

      // Desfazer devolve tudo.
      await blocks.unblock(a.ana, bloqueio.id);
      const devolta = await posts.list(a.ana, a.groupId);
      expect(devolta.posts.map((p) => p.id)).toContain(daGabi.id);
    });

    it('bloqueado comenta e reage no post da comunidade e quem bloqueou não é avisado', async () => {
      const a = await comunidade();
      const daAna = await posts.create(a.ana, a.groupId, { body: 'Post da Ana' });
      const daComunidade = await posts.create(a.prof, a.groupId, {
        body: 'Aviso geral',
        publishedAs: 'GROUP',
      });
      // Quem bloqueia é o autor do post da comunidade.
      await blocks.block(a.prof, { groupId: a.groupId, postId: daAna.id });
      enviados.length = 0;
      agrupados.length = 0;

      // A ação acontece de verdade: o post da comunidade é visível para a Ana.
      const c = await posts.comment(a.ana, a.groupId, daComunidade.id, { body: 'Valeu' });
      await posts.react(a.ana, a.groupId, daComunidade.id, 'HEART');
      const visto = await posts.get(a.gabi, a.groupId, daComunidade.id);
      expect(visto.comments.map((x) => x.id)).toContain(c.id);
      expect(visto.reactions.counts.HEART).toBe(1);
      const paraProf = [
        ...enviados.filter((e) => e.userIds.includes(a.prof)),
        ...agrupados.filter((e) => e.userId === a.prof),
      ];
      expect(paraProf).toEqual([]);
    });

    it('post publicado como a comunidade não some por bloqueio', async () => {
      const a = await comunidade();
      const daEquipe = await posts.create(a.prof, a.groupId, {
        body: 'Aviso da casa',
        publishedAs: 'GROUP',
      });
      expect(daEquipe.author).toMatchObject({ displayName: 'Academia Demo', asGroup: true });
      const doProf = await posts.create(a.prof, a.groupId, { body: 'Do prof' });
      await blocks.block(a.ana, { groupId: a.groupId, postId: doProf.id });
      const mural = await posts.list(a.ana, a.groupId);
      const ids = mural.posts.map((p) => p.id);
      expect(ids).toContain(daEquipe.id);
      expect(ids).not.toContain(doProf.id);
    });

    it('bloquear por comentário; o id do corpo vale só na comunidade da URL', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const doProf = await posts.create(a.prof, a.groupId, { body: 'x' });
      const c = await posts.comment(a.gabi, a.groupId, doProf.id, { body: 'comentário' });
      const deB = await posts.create(b.ana, b.groupId, { body: 'em B' });

      await expect(
        blocks.block(a.ana, { groupId: a.groupId, postId: deB.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Fora da comunidade nem com o id certo.
      await expect(
        blocks.block(b.ana, { groupId: a.groupId, postId: doProf.id }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        blocks.block(a.ana, { groupId: a.groupId, postId: doProf.id, commentId: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const feito = await blocks.block(a.ana, {
        groupId: a.groupId,
        postId: doProf.id,
        commentId: c.id,
      });
      const lista = await blocks.list(a.ana);
      expect(lista).toEqual([
        expect.objectContaining({
          id: feito.id,
          label: c.author.displayName,
          groupName: 'Academia Demo',
        }),
      ]);
      // Bloquear de novo não duplica; não dá para bloquear a si mesma nem post da comunidade.
      await blocks.block(a.ana, { groupId: a.groupId, postId: doProf.id, commentId: c.id });
      expect(await blocks.list(a.ana)).toHaveLength(1);
      const meu = await posts.create(a.ana, a.groupId, { body: 'meu' });
      await expect(
        blocks.block(a.ana, { groupId: a.groupId, postId: meu.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const daCasa = await posts.create(a.dono, a.groupId, { body: 'casa', publishedAs: 'GROUP' });
      await expect(
        blocks.block(a.ana, { groupId: a.groupId, postId: daCasa.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a lista e o desbloqueio são só da própria pessoa', async () => {
      const a = await comunidade();
      const p = await posts.create(a.gabi, a.groupId, { body: 'x' });
      const feito = await blocks.block(a.ana, { groupId: a.groupId, postId: p.id });
      expect(await blocks.list(a.prof)).toEqual([]);
      await expect(blocks.unblock(a.prof, feito.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await blocks.list(a.ana)).toHaveLength(1);
      // A Gabi não fica sabendo: a lista dela não mostra quem a bloqueou.
      expect(await blocks.list(a.gabi)).toEqual([]);
    });
  });

  describe('ocultar, filtros e posts novos', () => {
    it('ocultar some só para quem ocultou', async () => {
      const a = await comunidade();
      const p = await posts.create(a.gabi, a.groupId, { body: 'chato' });
      await posts.hide(a.ana, a.groupId, p.id);
      expect((await posts.list(a.ana, a.groupId)).posts.map((x) => x.id)).not.toContain(p.id);
      expect((await posts.list(a.prof, a.groupId)).posts.map((x) => x.id)).toContain(p.id);
      await expect(posts.hide(a.gabi, a.groupId, p.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('filtra por equipe, conteúdo novo e membros', async () => {
      const a = await comunidade();
      const prof = await posts.create(a.prof, a.groupId, { body: 'equipe' });
      const membro = await posts.create(a.ana, a.groupId, { body: 'membro' });
      const casa = await posts.create(a.dono, a.groupId, { body: 'casa', publishedAs: 'GROUP' });
      const ids = async (filter: 'team' | 'members' | 'content' | 'all') =>
        (await posts.list(a.gabi, a.groupId, null, filter)).posts.map((p) => p.id);
      expect(await ids('team')).toEqual([casa.id, prof.id]);
      expect(await ids('members')).toEqual([membro.id]);
      expect(await ids('content')).toEqual([]);
      expect(await ids('all')).toHaveLength(3);
    });

    it('conta os posts novos dos outros até a pessoa marcar como visto', async () => {
      const a = await comunidade();
      await posts.create(a.prof, a.groupId, { body: '1' });
      await posts.create(a.gabi, a.groupId, { body: '2' });
      await posts.create(a.ana, a.groupId, { body: 'meu' });
      expect((await posts.list(a.ana, a.groupId)).unseen).toBe(2);
      expect(await posts.unseen(a.ana, a.groupId)).toEqual({ count: 2 });
      await posts.markSeen(a.ana, a.groupId);
      expect(await posts.unseen(a.ana, a.groupId)).toEqual({ count: 0 });
      await posts.create(a.gabi, a.groupId, { body: '3' });
      expect(await posts.unseen(a.ana, a.groupId)).toEqual({ count: 1 });
      // Bloqueado não conta.
      const g = await posts.create(a.gabi, a.groupId, { body: '4' });
      await blocks.block(a.ana, { groupId: a.groupId, postId: g.id });
      expect(await posts.unseen(a.ana, a.groupId)).toEqual({ count: 0 });
    });
  });

  describe('avisos fixados', () => {
    it('ficam em ordem, saem do topo no prazo e a equipe reordena', async () => {
      const a = await comunidade();
      const p1 = await posts.create(a.dono, a.groupId, { body: 'um' });
      const p2 = await posts.create(a.dono, a.groupId, { body: 'dois' });
      const p3 = await posts.create(a.dono, a.groupId, { body: 'três', pin: true, pinDays: 3 });
      expect(p3.pinned).toBe(true);
      expect(p3.pinnedUntil).not.toBeNull();
      // O aviso novo entra na frente do carrossel (prancha Pn-14).
      await posts.pin(a.dono, a.groupId, p1.id, null);
      await posts.pin(a.dono, a.groupId, p2.id, 7);

      let mural = await posts.list(a.ana, a.groupId);
      expect(mural.pins.map((p) => p.id)).toEqual([p2.id, p1.id, p3.id]);
      expect(mural.posts.map((p) => p.id)).toEqual([]);

      await posts.reorderPins(a.dono, a.groupId, [p3.id, p1.id, p2.id]);
      mural = await posts.list(a.ana, a.groupId);
      expect(mural.pins.map((p) => p.id)).toEqual([p3.id, p1.id, p2.id]);

      // Reordenar com id faltando ou sem moderar é recusado.
      await expect(posts.reorderPins(a.dono, a.groupId, [p2.id, p3.id])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        posts.reorderPins(a.prof, a.groupId, [p1.id, p2.id, p3.id]),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Quarto aviso não entra; o prazo vencido sai do topo e volta ao mural.
      const p4 = await posts.create(a.dono, a.groupId, { body: 'quatro' });
      await expect(posts.pin(a.dono, a.groupId, p4.id, null)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await prisma.groupPost.update({
        where: { id: p2.id },
        data: { pinnedUntil: new Date(Date.now() - 1000) },
      });
      mural = await posts.list(a.ana, a.groupId);
      expect(mural.pins.map((p) => p.id)).toEqual([p3.id, p1.id]);
      expect(mural.posts.map((p) => p.id)).toContain(p2.id);
      await posts.pin(a.dono, a.groupId, p4.id, null);
      expect((await posts.list(a.ana, a.groupId)).pins).toHaveLength(3);
    });

    it('fixar em paralelo não passa do teto de 3 (pin, post fixado e comunicado)', async () => {
      const a = await comunidade();
      const soltos = await Promise.all(
        [1, 2, 3, 4, 5].map((i) => posts.create(a.dono, a.groupId, { body: `p${i}` })),
      );
      const tentativas = await Promise.allSettled([
        ...soltos.map((p) => posts.pin(a.dono, a.groupId, p.id, null)),
        ...[1, 2, 3].map((i) => posts.create(a.dono, a.groupId, { body: `novo ${i}`, pin: true })),
      ]);
      const ok = tentativas.filter((t) => t.status === 'fulfilled').length;
      const ativos = () =>
        prisma.groupPost.count({
          where: {
            groupId: a.groupId,
            pinnedAt: { not: null },
            OR: [{ pinnedUntil: null }, { pinnedUntil: { gt: new Date() } }],
          },
        });
      expect(ok).toBe(3);
      expect(await ativos()).toBe(3);
      for (const t of tentativas) {
        if (t.status === 'rejected') expect(t.reason).toBeInstanceOf(ConflictException);
      }

      // Comunicados fixados em paralelo com o topo cheio: tiram o último, sem passar de 3.
      await Promise.all(
        [1, 2, 3].map((i) =>
          announcements.create(a.dono, a.groupId, {
            title: `Aviso ${i}`,
            body: 'texto',
            publishedAs: 'GROUP',
            pin: true,
            pinDays: null,
            push: false,
            at: null,
            repeat: 'NONE',
          }),
        ),
      );
      expect(await ativos()).toBe(3);
    });

    it('reordenar tolera mais de 3 fixados de antes e devolve o topo ao teto', async () => {
      const a = await comunidade();
      const ps = await Promise.all(
        [1, 2, 3, 4].map((i) => posts.create(a.dono, a.groupId, { body: `p${i}` })),
      );
      // Estado antigo, de antes da trava: 4 fixados.
      await prisma.groupPost.updateMany({
        where: { id: { in: ps.map((p) => p.id) } },
        data: { pinnedAt: new Date() },
      });
      const ordem = [ps[3]!.id, ps[0]!.id, ps[1]!.id, ps[2]!.id];
      await posts.reorderPins(a.dono, a.groupId, ordem);
      const mural = await posts.list(a.ana, a.groupId);
      expect(mural.pins.map((p) => p.id)).toEqual(ordem.slice(0, 3));
      expect(mural.posts.map((p) => p.id)).toContain(ps[2]!.id);
    });

    it('membro não fixa nem publica como a comunidade', async () => {
      const a = await comunidade();
      await expect(
        posts.create(a.ana, a.groupId, { body: 'x', publishedAs: 'GROUP' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(posts.create(a.ana, a.groupId, { body: 'x', pin: true })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('enquetes', () => {
    async function enquete(a: Awaited<ReturnType<typeof comunidade>>) {
      return posts.create(a.prof, a.groupId, {
        kind: 'POLL',
        poll: { question: 'Qual horário do aulão?', options: ['8h', '9h', '10h'], days: 3 },
      });
    }

    it('o resultado só sai com 5 votos dos outros e depois de votar; o voto é anônimo', async () => {
      expect(POLL_MIN_VOTES).toBe(5);
      const a = await comunidade();
      const extras = [
        await entra(a.groupId, 'MEMBER'),
        await entra(a.groupId, 'MEMBER'),
        await entra(a.groupId, 'MEMBER'),
        await entra(a.groupId, 'MEMBER'),
      ];
      const p = await enquete(a);
      expect(p.kind).toBe('POLL');
      const [o8, o9] = p.poll!.options;

      const v = await posts.vote(a.ana, a.groupId, p.id, o8!.id);
      expect(v.poll).toMatchObject({ myOptionId: o8!.id, totalVotes: null, closed: false });
      expect(v.poll!.options.every((o) => o.percent === null)).toBe(true);
      // Nada de contagem escondida em outro campo.
      expect(JSON.stringify(v.poll)).not.toMatch(/"(_?count|votes)"/i);

      await posts.vote(a.gabi, a.groupId, p.id, o8!.id);
      await posts.vote(extras[0]!, a.groupId, p.id, o9!.id);
      await posts.vote(extras[1]!, a.groupId, p.id, o9!.id);
      // Quatro votos: ainda escondido, inclusive para quem votou e para a equipe.
      expect((await posts.get(a.ana, a.groupId, p.id)).poll!.totalVotes).toBeNull();
      expect((await posts.polls(a.dono, a.groupId))[0]!.totalVotes).toBeNull();

      await posts.vote(extras[2]!, a.groupId, p.id, o8!.id);
      // Cinco votos, mas só quatro dos outros: quem votou deduziria a distribuição deles
      // tirando o próprio voto. Continua escondido para quem votou.
      expect((await posts.get(a.ana, a.groupId, p.id)).poll!.totalVotes).toBeNull();
      // O painel de quem não votou já vê os 5.
      expect((await posts.polls(a.dono, a.groupId))[0]!.totalVotes).toBe(5);

      await posts.vote(extras[3]!, a.groupId, p.id, o9!.id);
      const ana = await posts.get(a.ana, a.groupId, p.id);
      expect(ana.poll!.totalVotes).toBe(6);
      expect(ana.poll!.options.map((o) => o.percent)).toEqual([50, 50, 0]);
      // Quem não votou ainda não vê (prancha Cm-21): vota primeiro.
      const prof = await posts.get(a.prof, a.groupId, p.id);
      expect(prof.poll!.totalVotes).toBeNull();
      expect(prof.poll!.myOptionId).toBeNull();
      // O painel da equipe vê o total e as %, nunca quem votou.
      const painel = await posts.polls(a.dono, a.groupId);
      expect(painel[0]).toMatchObject({ totalVotes: 6, question: 'Qual horário do aulão?' });
      expect(JSON.stringify(painel)).not.toContain(a.ana);
    });

    it('no painel, quem votou também precisa de 5 votos dos outros', async () => {
      const a = await comunidade();
      const outros = await Promise.all([1, 2, 3, 4].map(() => entra(a.groupId, 'MEMBER')));
      const p = await enquete(a);
      const [o8] = p.poll!.options;
      await posts.vote(a.dono, a.groupId, p.id, o8!.id);
      for (const m of outros) await posts.vote(m, a.groupId, p.id, o8!.id);
      expect((await posts.polls(a.dono, a.groupId))[0]!.totalVotes).toBeNull();
      expect((await posts.polls(a.prof, a.groupId))[0]!.totalVotes).toBe(5);
    });

    it('o voto não se apaga: só troca de opção (sem rota de tirar o voto)', async () => {
      expect(
        (PostController.prototype as unknown as Record<string, unknown>).unvote,
      ).toBeUndefined();
      const a = await comunidade();
      const p = await enquete(a);
      await expect(
        posts.vote(a.ana, a.groupId, p.id, null as unknown as string),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('muda o voto até o prazo; encerrada não aceita voto e mostra o resultado', async () => {
      const a = await comunidade();
      const p = await enquete(a);
      const [o8, o9] = p.poll!.options;
      await posts.vote(a.ana, a.groupId, p.id, o8!.id);
      const mudou = await posts.vote(a.ana, a.groupId, p.id, o9!.id);
      expect(mudou.poll!.myOptionId).toBe(o9!.id);
      expect(await prisma.groupPollVote.count({ where: { poll: { postId: p.id } } })).toBe(1);

      // Opção de outra enquete não vale.
      const outra = await enquete(a);
      await expect(
        posts.vote(a.ana, a.groupId, p.id, outra.poll!.options[0]!.id),
      ).rejects.toBeInstanceOf(NotFoundException);

      // Membro não encerra enquete da equipe; quem publicou encerra.
      await expect(posts.closePoll(a.gabi, a.groupId, p.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const fechada = await posts.closePoll(a.prof, a.groupId, p.id);
      expect(fechada.poll!.closed).toBe(true);
      await expect(posts.vote(a.gabi, a.groupId, p.id, o8!.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Encerrada com menos de 5: continua "amostra pequena".
      expect((await posts.get(a.gabi, a.groupId, p.id)).poll!.totalVotes).toBeNull();
    });

    it('valida pergunta, opções e prazo', async () => {
      const a = await comunidade();
      const criar = (poll: { question: string; options: string[]; days: number }) =>
        posts.create(a.ana, a.groupId, { kind: 'POLL', poll });
      await expect(criar({ question: 'Q?', options: ['só uma'], days: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        criar({ question: 'Q?', options: ['a', 'b', 'c', 'd', 'e'], days: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(criar({ question: ' ', options: ['a', 'b'], days: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(criar({ question: 'Q?', options: ['a', 'a'], days: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(criar({ question: 'Q?', options: ['a', 'b'], days: 0 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      const ok = await criar({ question: 'Q?', options: ['a', 'b'], days: 7 });
      expect(ok.poll!.options.map((o) => o.label)).toEqual(['a', 'b']);
    });
  });

  describe('comunicados', () => {
    it('agendado: publica no horário, fixa e avisa quem está na comunidade', async () => {
      const a = await comunidade();
      const at = new Date(Date.now() + 60 * 60_000);
      at.setUTCMinutes((Math.ceil(at.getUTCMinutes() / 15) * 15) % 60, 0, 0);
      if (at.getTime() <= Date.now()) at.setUTCHours(at.getUTCHours() + 1);
      const c = await announcements.create(a.dono, a.groupId, {
        title: 'Feriado',
        body: 'Abrimos das 8h às 14h.',
        publishedAs: 'GROUP',
        pin: true,
        pinDays: 3,
        push: true,
        at: at.toISOString(),
        repeat: 'NONE',
      });
      expect(c).toMatchObject({ title: 'Feriado', repeat: 'NONE' });
      expect(new Date(c.nextRunAt!).getTime()).toBe(at.getTime());
      expect((await announcements.list(a.prof, a.groupId)).map((x) => x.id)).toEqual([c.id]);
      expect((await posts.list(a.ana, a.groupId)).pins).toEqual([]);

      // Antes da hora nada sai; na hora, sai uma vez só.
      expect(await announcements.runDue(new Date(at.getTime() - 1000))).toBe(0);
      expect(await announcements.runDue(at)).toBe(1);
      expect(await announcements.runDue(new Date(at.getTime() + 60_000))).toBe(0);

      const mural = await posts.list(a.ana, a.groupId);
      expect(mural.pins).toHaveLength(1);
      expect(mural.pins[0]).toMatchObject({ kind: 'ANNOUNCEMENT', title: 'Feriado' });
      expect(mural.pins[0]!.author.asGroup).toBe(true);
      const aviso = enviados.find((e) => e.notice.kind === 'ANNOUNCEMENTS');
      expect(aviso).toBeDefined();
      expect(new Set(aviso!.userIds)).toEqual(new Set([a.prof, a.ana, a.gabi]));
      expect(aviso!.notice.title).toContain('Feriado');
      // Sem repetição, sai da lista de agendados.
      expect(await announcements.list(a.prof, a.groupId)).toEqual([]);
    });

    it('repete toda semana até cancelar', async () => {
      const a = await comunidade();
      const at = new Date(Date.now() + 15 * 60_000);
      at.setUTCMinutes((Math.ceil(at.getUTCMinutes() / 15) * 15) % 60, 0, 0);
      if (at.getTime() <= Date.now()) at.setUTCHours(at.getUTCHours() + 1);
      const c = await announcements.create(a.prof, a.groupId, {
        title: 'Aula de mobilidade',
        body: 'Toda terça.',
        publishedAs: 'PERSON',
        pin: false,
        pinDays: null,
        push: false,
        at: at.toISOString(),
        repeat: 'WEEKLY',
      });
      expect(await announcements.runDue(at)).toBe(1);
      const [depois] = await announcements.list(a.prof, a.groupId);
      expect(new Date(depois!.nextRunAt!).getTime()).toBe(at.getTime() + 7 * 86_400_000);
      // Sem push, ninguém é avisado.
      expect(enviados.filter((e) => e.notice.kind === 'ANNOUNCEMENTS')).toHaveLength(0);

      await announcements.cancel(a.prof, a.groupId, c.id);
      expect(await announcements.list(a.prof, a.groupId)).toEqual([]);
      expect(await announcements.runDue(new Date(at.getTime() + 8 * 86_400_000))).toBe(0);
    });

    it('agora: publica na hora; horário fora dos blocos de 15 min ou no passado é recusado', async () => {
      const a = await comunidade();
      const agora = await announcements.create(a.dono, a.groupId, {
        title: 'Já',
        body: 'Agora mesmo.',
        publishedAs: 'GROUP',
        pin: false,
        pinDays: null,
        push: true,
        at: null,
        repeat: 'NONE',
      });
      expect(agora.nextRunAt).toBeNull();
      expect((await posts.list(a.ana, a.groupId)).posts[0]).toMatchObject({ title: 'Já' });

      const torto = new Date(Date.now() + 3 * 60 * 60_000);
      torto.setUTCMinutes(7, 0, 0);
      const base = {
        title: 'x',
        body: 'y',
        publishedAs: 'GROUP' as const,
        pin: false,
        pinDays: null,
        push: false,
        repeat: 'NONE' as const,
      };
      await expect(
        announcements.create(a.dono, a.groupId, { ...base, at: torto.toISOString() }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        announcements.create(a.dono, a.groupId, {
          ...base,
          at: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('membro e criador não comunicam; comunicado de outra comunidade não é cancelado', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const criador = await entra(a.groupId, 'CREATOR');
      const base = {
        title: 'x',
        body: 'y',
        publishedAs: 'GROUP' as const,
        pin: false,
        pinDays: null,
        push: false,
        at: null,
        repeat: 'NONE' as const,
      };
      await expect(announcements.create(a.ana, a.groupId, base)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(announcements.create(criador, a.groupId, base)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const at = new Date(Date.now() + 2 * 60 * 60_000);
      at.setUTCMinutes(0, 0, 0);
      const deB = await announcements.create(b.dono, b.groupId, {
        ...base,
        at: at.toISOString(),
        repeat: 'DAILY',
      });
      await expect(announcements.cancel(a.dono, a.groupId, deB.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('comunicado em nome da pessoa não chega a quem a bloqueou', async () => {
      const a = await comunidade();
      const doProf = await posts.create(a.prof, a.groupId, { body: 'oi' });
      await blocks.block(a.ana, { groupId: a.groupId, postId: doProf.id });
      await announcements.create(a.prof, a.groupId, {
        title: 'Treino extra',
        body: 'Sábado.',
        publishedAs: 'PERSON',
        pin: false,
        pinDays: null,
        push: true,
        at: null,
        repeat: 'NONE',
      });
      const aviso = enviados.find((e) => e.notice.kind === 'ANNOUNCEMENTS');
      expect(aviso!.userIds).not.toContain(a.ana);
      expect(aviso!.userIds).toContain(a.gabi);
    });

    /** Um horário agendável (bloco de 15 min) daqui a `min` minutos. */
    function slot(min: number): Date {
      const at = new Date(Date.now() + min * 60_000);
      at.setUTCMinutes(Math.ceil(at.getUTCMinutes() / 15) * 15, 0, 0);
      return at;
    }
    const agendado = (repeat: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY', at: Date) => ({
      title: 'Agendado',
      body: 'Texto.',
      publishedAs: 'GROUP' as const,
      pin: false,
      pinDays: null,
      push: false,
      at: at.toISOString(),
      repeat,
    });
    const saidos = (announcementId: string) =>
      prisma.groupPost.count({ where: { announcementId } });

    it('volta de uma queda: os atrasados saem uma vez só e o próximo fica no futuro', async () => {
      const a = await comunidade();
      const at = slot(60);
      const c = await announcements.create(a.dono, a.groupId, agendado('DAILY', at));
      const volta = new Date(at.getTime() + 3 * 86_400_000 + 60 * 60_000);
      await announcements.runDue(volta);
      await announcements.runDue(volta);
      expect(await saidos(c.id)).toBe(1);
      const [depois] = await announcements.list(a.dono, a.groupId);
      expect(new Date(depois!.nextRunAt!).getTime()).toBe(at.getTime() + 4 * 86_400_000);
    });

    it('todo mês conta do dia marcado, no fuso da comunidade', async () => {
      const a = await comunidade();
      const c = await announcements.create(a.dono, a.groupId, agendado('MONTHLY', slot(60)));
      // 30/abr 22h em São Paulo já é 1º/mai em UTC.
      const ancora = new Date('2027-05-01T01:00:00Z');
      await prisma.groupAnnouncement.update({
        where: { id: c.id },
        data: { anchorAt: ancora, nextRunAt: ancora },
      });
      await announcements.runDue(ancora);
      expect(await saidos(c.id)).toBe(1);
      let [r] = await announcements.list(a.dono, a.groupId);
      expect(new Date(r!.nextRunAt!).toISOString()).toBe('2027-05-31T01:00:00.000Z');

      // Em outro fuso, o mesmo instante é outro dia do mês.
      await prisma.group.update({ where: { id: a.groupId }, data: { timezone: 'UTC' } });
      await prisma.groupAnnouncement.update({
        where: { id: c.id },
        data: { anchorAt: ancora, nextRunAt: ancora },
      });
      await announcements.runDue(ancora);
      expect(await saidos(c.id)).toBe(2);
      [r] = await announcements.list(a.dono, a.groupId);
      expect(new Date(r!.nextRunAt!).toISOString()).toBe('2027-06-01T01:00:00.000Z');
    });

    it('duas rodadas do job ao mesmo tempo publicam uma vez só', async () => {
      const a = await comunidade();
      const at = slot(60);
      const c = await announcements.create(a.dono, a.groupId, agendado('DAILY', at));
      await Promise.all([1, 2, 3, 4].map(() => announcements.runDue(at)));
      expect(await saidos(c.id)).toBe(1);
    });

    it('erro passageiro tenta de novo no mesmo horário, até um limite', async () => {
      const a = await comunidade();
      const at = slot(60);
      const c = await announcements.create(a.dono, a.groupId, agendado('NONE', at));
      const falha = jest
        .spyOn(posts, 'publishAnnouncement')
        .mockRejectedValueOnce(new Error('conexão caiu'));
      await announcements.runDue(at);
      expect(await saidos(c.id)).toBe(0);
      let row = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ canceledAt: null, attempts: 1 });
      expect(row.nextRunAt!.getTime()).toBe(at.getTime());

      await announcements.runDue(new Date(at.getTime() + 60_000));
      row = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(row).toMatchObject({ attempts: 0, nextRunAt: null, canceledAt: null });
      expect(await saidos(c.id)).toBe(1);

      // Falhando sempre, desiste no teto.
      const d = await announcements.create(a.dono, a.groupId, agendado('DAILY', at));
      falha.mockRejectedValue(new Error('fora do ar'));
      for (let i = 0; i < 10; i += 1) await announcements.runDue(at);
      falha.mockRestore();
      row = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: d.id } });
      expect(row.canceledAt).not.toBeNull();
      expect(row.nextRunAt).toBeNull();
    });

    it('quem perdeu o papel não publica: confere no disparo', async () => {
      const a = await comunidade();
      const at = slot(60);
      const c = await announcements.create(a.prof, a.groupId, agendado('DAILY', at));
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: a.groupId, userId: a.prof } },
        data: { role: 'MEMBER' },
      });
      await announcements.runDue(at);
      expect(await saidos(c.id)).toBe(0);
      const row = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.canceledAt).not.toBeNull();
    });

    it('mudar o papel, banir ou sair cancela os agendados da pessoa', async () => {
      const a = await comunidade();
      const at = slot(60);
      const prof2 = await entra(a.groupId, 'PROFESSIONAL');
      const prof3 = await entra(a.groupId, 'PROFESSIONAL');
      const mid = async (userId: string) =>
        (
          await prisma.groupMembership.findUniqueOrThrow({
            where: { groupId_userId: { groupId: a.groupId, userId } },
          })
        ).id;
      const doProf = await announcements.create(a.prof, a.groupId, agendado('DAILY', at));
      const doProf2 = await announcements.create(prof2, a.groupId, agendado('DAILY', at));
      const doProf3 = await announcements.create(prof3, a.groupId, agendado('DAILY', at));
      const doDono = await announcements.create(a.dono, a.groupId, agendado('DAILY', at));

      await memberships.changeRole(a.dono, a.groupId, await mid(a.prof), 'MEMBER');
      await memberships.ban(a.dono, a.groupId, await mid(prof2));
      await memberships.leave(prof3, a.groupId);

      const ativos = await announcements.list(a.dono, a.groupId);
      expect(ativos.map((x) => x.id)).toEqual([doDono.id]);
      for (const id of [doProf.id, doProf2.id, doProf3.id]) {
        const row = await prisma.groupAnnouncement.findUniqueOrThrow({ where: { id } });
        expect(row.canceledAt).not.toBeNull();
      }
    });
  });

  describe('posts automáticos', () => {
    it('conteúdo novo vira post uma vez só, só nos tipos ligados', async () => {
      const a = await comunidade();
      const entrada = {
        groupId: a.groupId,
        actorUserId: a.prof,
        kind: 'TIP' as const,
        refId: 'dica-1',
        title: 'Proteína em cada refeição',
        meta: 'nutrição',
      };
      const id = await publishAutoPost(prisma, entrada);
      expect(id).not.toBeNull();
      expect(await publishAutoPost(prisma, entrada)).toBeNull();
      const conteudo = await posts.list(a.ana, a.groupId, null, 'content');
      expect(conteudo.posts).toEqual([
        expect.objectContaining({
          kind: 'AUTO',
          title: 'Proteína em cada refeição',
          auto: { kind: 'TIP', refId: 'dica-1' },
        }),
      ]);
      await groups.update(a.dono, a.groupId, { autoPosts: ['PLAN'] });
      expect(await publishAutoPost(prisma, { ...entrada, refId: 'dica-2' })).toBeNull();
      expect(
        await publishAutoPost(prisma, { ...entrada, kind: 'PLAN', refId: 'p1' }),
      ).not.toBeNull();
    });
  });

  describe('Para você', () => {
    it('lista o que a equipe mandou só para a pessoa, os comunicados não vistos e o resolvido', async () => {
      const a = await comunidade();
      const b = await comunidade();
      const plano = await prisma.nutritionPlan.create({
        data: {
          userId: a.ana,
          authorId: a.prof,
          groupId: a.groupId,
          version: 1,
          kcalMin: 1700,
          kcalMax: 1900,
          proteinMinG: 100,
          proteinMaxG: 120,
          carbsMinG: 150,
          carbsMaxG: 200,
          fatMinG: 50,
          fatMaxG: 60,
        },
      });
      // De outra comunidade não entra.
      await prisma.nutritionPlan.create({
        data: {
          userId: a.ana,
          groupId: b.groupId,
          version: 1,
          kcalMin: 1,
          kcalMax: 2,
          proteinMinG: 1,
          proteinMaxG: 2,
          carbsMinG: 1,
          carbsMaxG: 2,
          fatMinG: 1,
          fatMaxG: 2,
        },
      });
      await announcements.create(a.dono, a.groupId, {
        title: 'Feriado na sexta',
        body: 'Abrimos às 8h.',
        publishedAs: 'GROUP',
        pin: false,
        pinDays: null,
        push: false,
        at: null,
        repeat: 'NONE',
      });

      const ana = await forYou.get(a.ana, a.groupId);
      expect(ana.todo).toEqual([
        expect.objectContaining({ kind: 'NUTRITION_PLAN', id: plano.id, href: '/nutrition/plan' }),
      ]);
      expect(ana.fromTeam).toEqual([
        expect.objectContaining({ title: 'Feriado na sexta', unread: true }),
      ]);
      expect(ana.count).toBe(2);
      // A Gabi não vê o plano da Ana.
      const gabi = await forYou.get(a.gabi, a.groupId);
      expect(gabi.todo).toEqual([]);

      await prisma.nutritionPlan.update({
        where: { id: plano.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await posts.markSeen(a.ana, a.groupId);
      const depois = await forYou.get(a.ana, a.groupId);
      expect(depois.todo).toEqual([]);
      expect(depois.done).toEqual([expect.objectContaining({ id: plano.id })]);
      expect(depois.fromTeam[0]!.unread).toBe(false);
      expect(depois.count).toBe(0);
      await expect(forYou.get(b.ana, a.groupId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('comunicado que a pessoa ocultou some; o que ela mesma mandou não conta como não lido', async () => {
      const a = await comunidade();
      const base = {
        body: 'Texto.',
        publishedAs: 'GROUP' as const,
        pin: false,
        pinDays: null,
        push: false,
        at: null,
        repeat: 'NONE' as const,
      };
      await announcements.create(a.prof, a.groupId, { ...base, title: 'Do prof' });
      await announcements.create(a.dono, a.groupId, { ...base, title: 'Da dona' });
      const doProf = await prisma.groupPost.findFirstOrThrow({
        where: { groupId: a.groupId, title: 'Do prof' },
      });
      await posts.hide(a.ana, a.groupId, doProf.id);

      const ana = await forYou.get(a.ana, a.groupId);
      expect(ana.fromTeam.map((c) => c.title)).toEqual(['Da dona']);
      expect(ana.count).toBe(1);

      const prof = await forYou.get(a.prof, a.groupId);
      expect(prof.fromTeam).toEqual([
        expect.objectContaining({ title: 'Da dona', unread: true }),
        expect.objectContaining({ title: 'Do prof', unread: false }),
      ]);
      expect(prof.count).toBe(1);
    });
  });
});

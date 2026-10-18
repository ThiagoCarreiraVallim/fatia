import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChallengeMetric } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../../progress/helpers/date-tz';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { CHALLENGE_METRICS } from '../../social/challenge-metric';
import { ScoreboardService } from '../../social/scoreboard.service';
import { ChallengeService, SCORE_TTL_MS } from '../challenge.service';
import { GroupService } from '../group.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';

const SP = 'America/Sao_Paulo';

/**
 * Desafios da comunidade (Fase 8a, ADR 027) no Postgres real: quem marca, quem
 * entra, quem vê o ranking, o isolamento pelo par da URL e o encerramento.
 */
describe('desafios da comunidade (integração)', () => {
  const prisma = new PrismaService();
  const challenges = new ChallengeService(
    prisma,
    new ScoreboardService(prisma, new DailyAdherenceService(prisma)),
    silentNotifications,
  );
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], null as never);

  const stamp = `desafio-${Date.now()}`;
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

  async function entra(groupId: string, role: 'MEMBER' | 'PROFESSIONAL', userId?: string) {
    const id = userId ?? (await pessoa(role === 'MEMBER' ? 'Membro' : 'Prof'));
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }

  async function comunidade(nome = 'Academia') {
    const dono = await pessoa('Dona');
    const g = await groups.create(dono, { type: 'SPONSORED', name: nome });
    grupos.push(g.id);
    return {
      groupId: g.id,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      membro: await entra(g.id, 'MEMBER'),
    };
  }

  const hoje = () => todayInTz(SP);

  /** Um desafio já em andamento: marca para hoje e recua a janela no banco. */
  async function emAndamento(groupId: string, autor: string, metric: ChallengeMetric, dias = 3) {
    const c = await challenges.create(autor, groupId, {
      title: 'Semana ativa',
      metric,
      startDate: hoje(),
      endDate: hoje(),
    });
    const inicio = addDaysIso(hoje(), -(dias - 1));
    await prisma.groupChallenge.update({
      where: { id: c.id },
      data: {
        startsAt: dayBoundsInTz(inicio, SP).start,
        endsAt: dayBoundsInTz(hoje(), SP).end,
      },
    });
    return c.id;
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('as métricas do código são as do enum do banco', () => {
    expect(Object.values(ChallengeMetric)).toEqual([...CHALLENGE_METRICS]);
  });

  describe('equipe', () => {
    it('dono e profissional marcam; membro não; quem é de fora nem vê a comunidade', async () => {
      const a = await comunidade();
      const estranho = await pessoa('Estranho');
      const base = {
        title: 'Mais água',
        metric: 'WATER_ML' as const,
        startDate: hoje(),
        endDate: addDaysIso(hoje(), 6),
      };

      expect(await challenges.create(a.dono, a.groupId, base)).toMatchObject({
        title: 'Mais água',
        status: 'running',
        startDate: hoje(),
        endDate: addDaysIso(hoje(), 6),
        participants: 0,
        canManage: true,
        me: null,
        leaderboard: null,
      });
      await expect(challenges.create(a.prof, a.groupId, base)).resolves.toMatchObject({
        canManage: true,
      });
      await expect(challenges.create(a.membro, a.groupId, base)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(challenges.create(estranho, a.groupId, base)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('recusa começo no passado, fim antes do começo e mais de 90 dias', async () => {
      const a = await comunidade();
      const base = { title: 'Passos', metric: 'STEPS' as const };
      for (const datas of [
        { startDate: addDaysIso(hoje(), -1), endDate: hoje() },
        { startDate: addDaysIso(hoje(), 2), endDate: addDaysIso(hoje(), 1) },
        { startDate: hoje(), endDate: addDaysIso(hoje(), 90) },
      ]) {
        await expect(
          challenges.create(a.dono, a.groupId, { ...base, ...datas }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      await expect(
        challenges.create(a.dono, a.groupId, {
          ...base,
          startDate: hoje(),
          endDate: addDaysIso(hoje(), 89),
        }),
      ).resolves.toMatchObject({ endDate: addDaysIso(hoje(), 89) });
    });

    it('muda e apaga só antes de começar; o profissional não mexe no desafio da dona', async () => {
      const a = await comunidade();
      const amanha = addDaysIso(hoje(), 1);
      const marcado = await challenges.create(a.dono, a.groupId, {
        title: 'Treinos',
        metric: 'WORKOUT_SESSIONS',
        startDate: amanha,
        endDate: addDaysIso(amanha, 6),
      });
      expect(marcado.status).toBe('upcoming');

      await expect(
        challenges.update(a.prof, a.groupId, marcado.id, {
          title: 'Meu',
          metric: 'STEPS',
          startDate: amanha,
          endDate: amanha,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const mudado = await challenges.update(a.dono, a.groupId, marcado.id, {
        title: 'Treinos da semana',
        metric: 'ACTIVE_DAYS',
        startDate: amanha,
        endDate: addDaysIso(amanha, 2),
      });
      expect(mudado).toMatchObject({ title: 'Treinos da semana', metric: 'ACTIVE_DAYS' });

      const andando = await emAndamento(a.groupId, a.dono, 'STEPS');
      await expect(
        challenges.update(a.dono, a.groupId, andando, {
          title: 'X y z',
          metric: 'STEPS',
          startDate: hoje(),
          endDate: hoje(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(challenges.remove(a.dono, a.groupId, andando)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(challenges.remove(a.dono, a.groupId, marcado.id)).resolves.toEqual({
        deleted: true,
      });
    });
  });

  describe('membro', () => {
    it('entra com apelido, vê o ranking com a própria linha marcada; quem não entrou não vê', async () => {
      const a = await comunidade();
      const outro = await entra(a.groupId, 'MEMBER');
      const id = await emAndamento(a.groupId, a.dono, 'WATER_ML');
      const ontem = addDaysIso(hoje(), -1);
      await prisma.waterLog.createMany({
        data: [
          { userId: a.membro, date: ontem, ml: 500 },
          { userId: a.membro, date: hoje(), ml: 300 },
          { userId: outro, date: hoje(), ml: 2000 },
        ],
      });

      const fora = await challenges.get(a.membro, a.groupId, id);
      expect(fora.leaderboard).toBeNull();
      expect(fora.me).toBeNull();

      const dentro = await challenges.join(a.membro, a.groupId, id, '  Ana   Lima ');
      expect(dentro.me).toMatchObject({ displayName: 'Ana Lima', score: 800, rank: 1 });
      expect(dentro.leaderboard).toEqual([
        { displayName: 'Ana Lima', score: 800, rank: 1, isMe: true, medal: null },
      ]);

      // Quem não entrou continua fora do placar, por mais água que tenha bebido.
      const daOutra = await challenges.get(outro, a.groupId, id);
      expect(daOutra.leaderboard).toBeNull();
      expect(daOutra.participants).toBe(1);

      // O apelido fica para o próximo desafio.
      const proximo = await emAndamento(a.groupId, a.dono, 'STEPS');
      expect((await challenges.get(a.membro, a.groupId, proximo)).suggestedDisplayName).toBe(
        'Ana Lima',
      );
    });

    it('o ranking só traz apelido, pontuação, posição, a marca de quem vê e a medalha', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, 'KCAL_IN_RANGE_DAYS');
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(Object.keys(r.leaderboard![0]).sort()).toEqual([
        'displayName',
        'isMe',
        'medal',
        'rank',
        'score',
      ]);
    });

    it('desafio de outra comunidade é 404, mesmo para quem está nas duas', async () => {
      const a = await comunidade();
      const b = await comunidade('Outra');
      await entra(b.groupId, 'MEMBER', a.membro);
      const deB = await emAndamento(b.groupId, b.dono, 'STEPS');

      await expect(challenges.get(a.membro, a.groupId, deB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(challenges.join(a.membro, a.groupId, deB, 'Ana')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(challenges.end(a.dono, a.groupId, deB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('sai antes do fim; depois de encerrado, nem entra nem sai', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, 'ACTIVE_DAYS');
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      expect(await challenges.leave(a.membro, a.groupId, id)).toEqual({ left: true });
      expect((await challenges.get(a.membro, a.groupId, id)).participants).toBe(0);

      await challenges.join(a.membro, a.groupId, id, 'Ana');
      await challenges.end(a.dono, a.groupId, id);
      await expect(challenges.leave(a.membro, a.groupId, id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const intruso = await entra(a.groupId, 'MEMBER');
      await expect(challenges.join(intruso, a.groupId, id, 'Zé')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('quem sai da comunidade some do placar', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, 'STEPS');
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      await challenges.join(a.prof, a.groupId, id, 'Prof');
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: a.groupId, userId: a.membro } },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      const r = await challenges.get(a.prof, a.groupId, id);
      expect(r.participants).toBe(1);
      expect(r.leaderboard!.map((l) => l.displayName)).toEqual(['Prof']);
    });
  });

  describe('placar', () => {
    it('dia na faixa de kcal conta pela meta de cada um; sem meta, não conta', async () => {
      const a = await comunidade();
      const semMeta = await entra(a.groupId, 'MEMBER');
      await prisma.userGoals.create({
        data: {
          userId: a.membro,
          kcalMin: 1800,
          kcalMax: 2200,
          proteinMinG: 100,
          proteinMaxG: 160,
          carbsMinG: 0,
          carbsMaxG: 400,
          fatMinG: 0,
          fatMaxG: 100,
        },
      });
      const id = await emAndamento(a.groupId, a.dono, 'KCAL_IN_RANGE_DAYS');
      const refeicao = async (userId: string, dia: string, kcal: number, proteinG: number) =>
        prisma.meal.create({
          data: {
            userId,
            mealType: 'LUNCH',
            eatenAt: new Date(dayBoundsInTz(dia, SP).start.getTime() + 12 * 3600_000),
            items: {
              create: [{ foodName: 'Prato', grams: 300, kcal, proteinG, carbsG: 0, fatG: 0 }],
            },
          },
        });
      await refeicao(a.membro, hoje(), 2000, 90);
      await refeicao(a.membro, addDaysIso(hoje(), -1), 2600, 120);
      await refeicao(semMeta, hoje(), 2000, 120);

      await challenges.join(a.membro, a.groupId, id, 'Ana');
      await challenges.join(semMeta, a.groupId, id, 'Bia');
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(r.leaderboard!.map((l) => [l.displayName, l.score])).toEqual([
        ['Ana', 1],
        ['Bia', 0],
      ]);
    });

    it('recalcula na leitura só quando o placar ficou velho', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, 'WATER_ML');
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      expect((await challenges.get(a.membro, a.groupId, id)).me!.score).toBe(0);

      await prisma.waterLog.create({ data: { userId: a.membro, date: hoje(), ml: 400 } });
      expect((await challenges.get(a.membro, a.groupId, id)).me!.score).toBe(0);

      await prisma.groupChallenge.update({
        where: { id },
        data: { scoredAt: new Date(Date.now() - SCORE_TTL_MS - 1000) },
      });
      expect((await challenges.get(a.membro, a.groupId, id)).me!.score).toBe(400);
    });

    it('encerrar grava a posição final e as medalhas; fechar de novo não muda nada', async () => {
      const a = await comunidade();
      const terceiro = await entra(a.groupId, 'MEMBER');
      const zerado = await entra(a.groupId, 'MEMBER');
      const id = await emAndamento(a.groupId, a.dono, 'WATER_ML');
      await prisma.waterLog.createMany({
        data: [
          { userId: a.membro, date: hoje(), ml: 900 },
          { userId: a.prof, date: hoje(), ml: 900 },
          { userId: terceiro, date: hoje(), ml: 100 },
        ],
      });
      for (const [quem, nome] of [
        [a.membro, 'Ana'],
        [a.prof, 'Prof'],
        [terceiro, 'Caio'],
        [zerado, 'Duda'],
      ] as const) {
        await challenges.join(quem, a.groupId, id, nome);
      }

      const fechado = await challenges.end(a.dono, a.groupId, id);
      expect(fechado).toMatchObject({ status: 'ended', endedEarly: true });
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(r.leaderboard!.map((l) => [l.displayName, l.rank, l.medal])).toEqual([
        ['Ana', 1, 'gold'],
        ['Prof', 1, 'gold'],
        ['Caio', 3, 'bronze'],
        // Pontuação zero não ganha medalha, nem com posição.
        ['Duda', 4, null],
      ]);
      const ranks = await prisma.groupChallengeParticipant.findMany({
        where: { challengeId: id },
        select: { displayName: true, finalRank: true },
        orderBy: { displayName: 'asc' },
      });
      expect(ranks).toEqual([
        { displayName: 'Ana', finalRank: 1 },
        { displayName: 'Caio', finalRank: 3 },
        { displayName: 'Duda', finalRank: 4 },
        { displayName: 'Prof', finalRank: 1 },
      ]);

      // Quem sai da comunidade depois do fim some da lista, mas as posições e
      // as medalhas dos outros ficam como foram entregues.
      await prisma.groupMembership.update({
        where: { groupId_userId: { groupId: a.groupId, userId: a.prof } },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      const doCaio = await challenges.get(terceiro, a.groupId, id);
      expect(doCaio.me).toMatchObject({ rank: 3, medal: 'bronze' });
      expect(doCaio.leaderboard!.map((l) => [l.displayName, l.rank, l.medal])).toEqual([
        ['Ana', 1, 'gold'],
        ['Caio', 3, 'bronze'],
        ['Duda', 4, null],
      ]);

      // Registro depois de encerrado não muda o resultado, nem com a faxina rodando.
      await prisma.waterLog.create({ data: { userId: zerado, date: hoje(), ml: 5000 } });
      await challenges.finalizeDue();
      await prisma.groupChallenge.update({ where: { id }, data: { scoredAt: new Date(0) } });
      const depois = await challenges.get(a.membro, a.groupId, id);
      expect(depois.leaderboard!.find((l) => l.displayName === 'Duda')!.score).toBe(0);
    });

    it('o desafio que venceu fecha sozinho, uma vez só', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, 'WATER_ML');
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      // A janela acabou agora há pouco e ninguém leu o desafio desde então.
      await prisma.groupChallenge.update({
        where: { id },
        data: { endsAt: new Date(Date.now() - 1) },
      });

      const [x, y] = await Promise.all([challenges.finalizeDue(), challenges.finalizeDue()]);
      const row = await prisma.groupChallenge.findUniqueOrThrow({ where: { id } });
      expect(row.finalizedAt).not.toBeNull();
      // Duas instâncias rodando juntas: só uma fecha (nenhum outro desafio
      // deste arquivo está vencido e aberto).
      expect(x + y).toBe(1);
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: id },
      });
      expect(p.finalRank).toBe(1);
    });
  });
});

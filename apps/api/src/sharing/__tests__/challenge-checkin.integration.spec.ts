import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../../common/prisma.service';
import { DailyAdherenceService } from '../../nutrition/daily-adherence.service';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../../progress/helpers/date-tz';
import { ScoreboardService } from '../../social/scoreboard.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import type { NotificationService } from '../../notifications/notification.service';
import type { Notice } from '../../notifications/notification.service';
import { ChallengeCheckinService, MEMBER_FLAGS_PER_DAY } from '../challenge-checkin.service';
import {
  CHECKIN_PHOTO_RETENTION_MS,
  ChallengeService,
  REVIEW_GRACE_MS,
  REVIEW_QUEUE_MAX,
  normalizeRules,
  type ChallengeInput,
} from '../challenge.service';
import { GroupService } from '../group.service';
import { GetChallengeLeaderboardTool } from '../mcp/get-challenge-leaderboard.tool';
import { WaterLogService } from '../../progress/water-log.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

const SP = 'America/Sao_Paulo';

/**
 * Desafios do redesign (#395, ADR 044 e 047) no Postgres real: tipos e regras,
 * ranking visto por quem não entrou, check-in com foto e as regras do servidor,
 * sinalização com limite, fila de revisão da equipe, retenção da foto e o aviso
 * de começo.
 */
describe('desafios do redesign: tipos, check-in com foto e revisão (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const avisos: Array<{ to: string[]; notice: Notice }> = [];
  const notifications = {
    notify: (to: readonly string[], notice: Notice) => avisos.push({ to: [...to], notice }),
    notifyGrouped: () => undefined,
    drain: async () => undefined,
  } as unknown as NotificationService;
  const scoreboard = new ScoreboardService(prisma, new DailyAdherenceService(prisma));
  const challenges = new ChallengeService(prisma, scoreboard, notifications, media);
  const checkins = new ChallengeCheckinService(prisma, challenges, media, notifications);
  const groups = new GroupService(prisma, new ProfessionalLinkService(prisma), [], null as never);
  const memberships = new MembershipService(
    prisma,
    new ProfessionalLinkService(prisma),
    notifications,
    challenges,
  );

  const stamp = `checkin-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: `${nome} ${n}`,
        timezone: SP,
      },
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
    await prisma.user.update({ where: { id: dono }, data: { timezone: SP } });
    const g = await groups.create(dono, { type: 'SPONSORED', name: nome });
    await prisma.group.update({ where: { id: g.id }, data: { timezone: SP } });
    grupos.push(g.id);
    return {
      groupId: g.id,
      dono,
      prof: await entra(g.id, 'PROFESSIONAL'),
      membro: await entra(g.id, 'MEMBER'),
    };
  }

  const hoje = () => todayInTz(SP);

  /** Marca para hoje e recua o começo, para o desafio já estar em andamento. */
  async function emAndamento(
    groupId: string,
    autor: string,
    input: Omit<ChallengeInput, 'title' | 'startDate' | 'endDate'>,
    dias = 3,
  ) {
    // Passos não se criam até a sync de saúde (#395): o desafio nasce de água e
    // recebe as regras de passos direto no banco, como um que já existisse.
    const passos = input.kind === 'STEPS' || (input.pointsTable?.steps ?? 0) > 0;
    const c = await challenges.create(autor, groupId, {
      title: 'Desafio',
      startDate: hoje(),
      endDate: addDaysIso(hoje(), 5),
      ...(passos ? { kind: 'WATER' as const } : input),
    });
    await prisma.groupChallenge.update({
      where: { id: c.id },
      data: {
        ...(passos ? normalizeRules({ title: 'x', startDate: '', endDate: '', ...input }) : {}),
        startsAt: dayBoundsInTz(addDaysIso(hoje(), -(dias - 1)), SP).start,
      },
    });
    return c.id;
  }

  /** Força o recálculo na próxima leitura. */
  const velho = (id: string) =>
    prisma.groupChallenge.update({ where: { id }, data: { scoredAt: null } });

  let cor = 0;
  async function foto(userId: string, groupId: string) {
    cor += 1;
    const body = await sharp({
      // Cada foto com um tamanho: cores vizinhas viram a mesma imagem depois de
      // reencodada, e o desafio a recusaria como repetida.
      create: {
        width: 32 + cor,
        height: 32,
        channels: 3,
        background: { r: cor % 255, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    const r = await media.requestUpload(userId, {
      purpose: 'challenge_checkin',
      groupId,
      mime: 'image/jpeg',
      bytes: body.length,
    });
    const file = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(file.key, body, 'image/jpeg');
    await media.confirm(userId, r.fileId);
    return r.fileId;
  }

  /** Um treino concluído agora há `minutosAtras`, de `duracao` minutos, gravado ao começar. */
  async function treino(userId: string, duracao = 52, minutosAtras = 5, gravadoDepois = false) {
    const fim = new Date(Date.now() - minutosAtras * 60_000);
    const inicio = new Date(fim.getTime() - duracao * 60_000);
    const gravado = new Date(Math.min(fim.getTime() + 30 * 60_000, Date.now()));
    return prisma.workoutSession.create({
      data: {
        userId,
        planName: 'Push',
        fromPlan: true,
        startedAt: inicio,
        completedAt: fim,
        createdAt: gravadoDepois ? gravado : inicio,
        // Lançado depois: o servidor fechou na hora em que gravou.
        serverCompletedAt: gravadoDepois ? gravado : fim,
      },
    });
  }

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.mediaFile.deleteMany({ where: { uploaderId: { in: criados } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('tipos e regras (Pn-13)', () => {
    it('cada tipo grava só as regras dele; água, passos e nutrição não somam quantidade', async () => {
      const a = await comunidade();
      const base = {
        title: 'Novo',
        startDate: addDaysIso(hoje(), 1),
        endDate: addDaysIso(hoje(), 7),
      };

      const agua = await challenges.create(a.dono, a.groupId, {
        ...base,
        kind: 'WATER',
        waterGoalMl: 2500,
        stepsGoal: 9000,
      });
      expect(agua).toMatchObject({
        kind: 'WATER',
        metric: 'WATER_ML',
        status: 'upcoming',
        rules: { waterGoalMl: 2500, dailyCap: 4000, stepsGoal: null, pointsTable: null },
      });

      const pontos = await challenges.create(a.dono, a.groupId, {
        ...base,
        kind: 'POINTS',
        pointsTable: { workout: 3, water: 1, steps: 1, protein: 1 },
      });
      expect(pontos).toMatchObject({
        kind: 'POINTS',
        needsPhotoConsent: true,
        rules: {
          pointsTable: { workout: 3, water: 1, steps: 1, protein: 1 },
          maxPointsPerDay: 6,
          checkin: { minWorkoutMinutes: 20, windowHours: 2 },
        },
      });

      const nutri = await challenges.create(a.dono, a.groupId, {
        ...base,
        kind: 'NUTRITION',
        metric: 'KCAL_IN_RANGE_DAYS',
      });
      expect(nutri).toMatchObject({ kind: 'NUTRITION', metric: 'KCAL_IN_RANGE_DAYS' });
    });

    it('recusa ml e passos somados, passos à mão, nutrição fora da meta e pontos sem tabela', async () => {
      const a = await comunidade();
      const base = { title: 'Novo', startDate: hoje(), endDate: addDaysIso(hoje(), 7) };
      for (const ruim of [
        { kind: 'METRIC' as const, metric: 'WATER_ML' as const },
        { metric: 'STEPS' as const },
        { kind: 'STEPS' as const, allowedStepSources: ['MANUAL' as const] },
        { kind: 'NUTRITION' as const, metric: 'ACTIVE_DAYS' as const },
        { kind: 'POINTS' as const, pointsTable: {} },
        { kind: 'POINTS' as const, pointsTable: { workout: 9 } },
        { kind: 'WATER' as const, waterGoalMl: 3000, dailyCap: 2000 },
      ]) {
        await expect(
          challenges.create(a.dono, a.groupId, { ...base, ...ruim }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });

  describe('ranking e dias', () => {
    it('quem não entrou vê o ranking (apelido, dias, sequência), sem ml de ninguém', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'WATER', waterGoalMl: 2000 });
      const ontem = addDaysIso(hoje(), -1);
      await prisma.waterLog.createMany({
        data: [
          {
            userId: a.membro,
            date: ontem,
            ml: 2100,
            loggedAt: new Date(dayBoundsInTz(ontem, SP).start.getTime() + 12 * 3600_000),
          },
          { userId: a.membro, date: hoje(), ml: 1200 },
          { userId: a.membro, date: hoje(), ml: 900 },
        ],
      });
      await challenges.join(a.membro, a.groupId, id, 'Ana');

      const visitante = await challenges.get(a.prof, a.groupId, id);
      expect(visitante.me).toBeNull();
      expect(visitante.today).toBeNull();
      expect(visitante.leaderboard).toEqual([
        { displayName: 'Ana', score: 2, rank: 1, isMe: false, medal: null, streak: 2 },
      ]);
      // A atividade fala de dias, nunca de quanto.
      // (Sem os ids: um uuid pode conter "900" por acaso.)
      const semIds = visitante.activity.map(({ id: _id, ...resto }) => resto);
      expect(JSON.stringify(semIds)).not.toMatch(/2100|1200|900|2000/);
      expect(visitante.activity.every((i) => i.parts.every((p) => p === 'water'))).toBe(true);

      const eu = await challenges.get(a.membro, a.groupId, id);
      expect(eu.me).toMatchObject({ score: 2, streak: 2, rank: 1 });
      // Os ml de hoje são dela, para ela.
      expect(eu.today).toMatchObject({
        points: 1,
        items: [{ item: 'water', done: true, value: 2100, goal: 2000 }],
      });
    });

    it('passos: à mão não contam; salto estranho vai para a fila e o dia espera a equipe', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'STEPS', stepsGoal: 10_000 });
      const ontem = addDaysIso(hoje(), -1);
      const meioDia = (d: string, min = 0) =>
        new Date(dayBoundsInTz(d, SP).start.getTime() + (12 * 60 + min) * 60_000);
      await prisma.stepLog.createMany({
        data: [
          {
            userId: a.membro,
            date: ontem,
            steps: 12_000,
            source: 'MANUAL',
            loggedAt: meioDia(ontem),
          },
          {
            userId: a.membro,
            date: hoje(),
            steps: 1_000,
            source: 'GARMIN',
            loggedAt: meioDia(hoje()),
          },
          {
            userId: a.membro,
            date: hoje(),
            steps: 15_000,
            source: 'GARMIN',
            loggedAt: meioDia(hoje(), 10),
          },
        ],
      });
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(r.me).toMatchObject({ score: 0, pendingReview: 1 });

      const fila = await checkins.queue(a.prof, a.groupId);
      expect(fila.items).toHaveLength(1);
      expect(fila.items[0]).toMatchObject({ type: 'steps', source: 'system', displayName: 'Ana' });
      expect(fila.items[0]!.why).not.toMatch(/\d/);

      await checkins.resolve(a.prof, a.groupId, id, fila.items[0]!.id, { decision: 'valid' });
      await velho(id);
      expect((await challenges.get(a.membro, a.groupId, id)).me).toMatchObject({
        score: 1,
        pendingReview: 0,
      });
    });

    it('pontos somam a tabela com teto por dia', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, {
        kind: 'POINTS',
        pointsTable: { water: 2, steps: 2 },
        maxPointsPerDay: 3,
        waterGoalMl: 1000,
        stepsGoal: 5000,
      });
      await prisma.waterLog.create({ data: { userId: a.membro, date: hoje(), ml: 1500 } });
      await prisma.stepLog.create({
        data: { userId: a.membro, date: hoje(), steps: 6000, source: 'APPLE_HEALTH' },
      });
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(r.me!.score).toBe(3);
      expect(r.today).toMatchObject({ points: 3, maxPoints: 3 });
    });
  });

  describe('check-in com foto (Cm-18)', () => {
    async function desafioDeFoto() {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'PHOTO' });
      return { ...a, id };
    }

    it('entrar pede o aceite da foto, gravado com a versão', async () => {
      const a = await desafioDeFoto();
      await expect(challenges.join(a.membro, a.groupId, a.id, 'Ana')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await challenges.join(a.membro, a.groupId, a.id, 'Ana', { acceptPhotoTerms: true });
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: a.id },
      });
      expect(p.photoConsentAt).not.toBeNull();
      expect(p.photoConsentVersion).toBeTruthy();
    });

    it('sem treino, treino curto e treino lançado depois não liberam; o válido conta 1 dia', async () => {
      const a = await desafioDeFoto();
      await challenges.join(a.membro, a.groupId, a.id, 'Ana', { acceptPhotoTerms: true });
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        eligible: false,
        reason: 'no_workout',
      });

      await treino(a.membro, 12);
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        eligible: false,
        reason: 'too_short',
        workout: { minutes: 12 },
      });

      await treino(a.membro, 40, 3, true);
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        reason: 'late_logged',
      });

      // Treino que acabou há mais de 2 h não libera.
      await prisma.workoutSession.deleteMany({ where: { userId: a.membro } });
      await treino(a.membro, 52, 130);
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        reason: 'no_workout',
      });

      const t = await treino(a.membro, 52, 10);
      const ok = await checkins.eligibility(a.membro, a.groupId, a.id);
      expect(ok).toMatchObject({
        eligible: true,
        workout: { id: t.id, name: 'Push', minutes: 52 },
      });

      const r = await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
        caption: 'Peito em dia',
      });
      expect(r.me).toMatchObject({ score: 1, streak: 1 });
      expect(r.today?.checkedInAt).toBeTruthy();
      const meu = r.activity.find((i) => i.isMe)!;
      expect(meu).toMatchObject({ type: 'checkin', status: 'valid' });
      expect(meu.photoUrl).toMatch(/^memory:\/\/get\//);

      // Um por dia.
      await expect(
        checkins.create(a.membro, a.groupId, a.id, {
          photoFileId: await foto(a.membro, a.groupId),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('a foto tem de ser da própria pessoa, desta comunidade e nunca usada antes', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(a.membro, a.groupId, a.id, 'Ana', { acceptPhotoTerms: true });
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      await treino(a.membro);
      await treino(outro);

      const daBia = await foto(outro, a.groupId);
      await expect(
        checkins.create(a.membro, a.groupId, a.id, { photoFileId: daBia }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const b = await comunidade('Outra');
      await entra(b.groupId, 'MEMBER', a.membro);
      const deOutraComunidade = await foto(a.membro, b.groupId);
      await expect(
        checkins.create(a.membro, a.groupId, a.id, { photoFileId: deOutraComunidade }),
      ).rejects.toBeInstanceOf(NotFoundException);

      // A mesma imagem, reenviada, é barrada.
      const primeira = await foto(a.membro, a.groupId);
      await checkins.create(a.membro, a.groupId, a.id, { photoFileId: primeira });
      const arquivo = await prisma.mediaFile.findUniqueOrThrow({ where: { id: primeira } });
      const bytes = store.objects.get(arquivo.key)!.body;
      const r = await media.requestUpload(outro, {
        purpose: 'challenge_checkin',
        groupId: a.groupId,
        mime: 'image/webp',
        bytes: bytes.length,
      });
      const k = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } })).key;
      store.upload(k, bytes, 'image/webp');
      await media.confirm(outro, r.fileId);
      await expect(
        checkins.create(outro, a.groupId, a.id, { photoFileId: r.fileId }),
      ).rejects.toMatchObject({ response: { code: 'photo_reused' } });
    });

    it('editar o treino depois manda o check-in de volta à revisão', async () => {
      const a = await desafioDeFoto();
      await challenges.join(a.membro, a.groupId, a.id, 'Ana', { acceptPhotoTerms: true });
      const t = await treino(a.membro);
      await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      await prisma.workoutSession.update({
        where: { id: t.id },
        data: { startedAt: new Date(t.startedAt.getTime() - 60 * 60_000) },
      });
      await velho(a.id);
      const r = await challenges.get(a.membro, a.groupId, a.id);
      expect(r.me).toMatchObject({ score: 0, pendingReview: 1 });
      expect(r.activity.find((i) => i.isMe)).toMatchObject({
        status: 'review',
        reason: 'Treino editado depois do check-in',
      });
    });
  });

  describe('sinalização e fila (Cm-17, Pn-13)', () => {
    async function comCheckin() {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'PHOTO' });
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(a.membro, a.groupId, id, 'Ana', { acceptPhotoTerms: true });
      await challenges.join(outro, a.groupId, id, 'Bia', { acceptPhotoTerms: true });
      await treino(a.membro);
      const r = await checkins.create(a.membro, a.groupId, id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      const checkinId = r.activity.find((i) => i.isMe)!.id;
      return { ...a, id, outro, checkinId };
    }

    it('quem participa sinaliza sem ver a foto; o ponto espera; a equipe anula com motivo', async () => {
      const a = await comCheckin();
      const visto = await challenges.get(a.outro, a.groupId, a.id);
      const linha = visto.activity.find((i) => i.id === a.checkinId)!;
      expect(linha).toMatchObject({ isMe: false, canFlag: true, photoUrl: null, reason: null });

      // Quem não participa e a própria pessoa não sinalizam.
      await expect(checkins.flag(a.prof, a.groupId, a.id, a.checkinId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(checkins.flag(a.membro, a.groupId, a.id, a.checkinId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await checkins.flag(a.outro, a.groupId, a.id, a.checkinId);
      await velho(a.id);
      const dela = await challenges.get(a.membro, a.groupId, a.id);
      expect(dela.me).toMatchObject({ score: 0, pendingReview: 1 });
      // Quem foi sinalizado não sabe quem sinalizou: a linha dela não cita ninguém, e
      // nada na resposta leva o id de quem sinalizou ou o vínculo dele com a sinalização.
      const minha = dela.activity.find((i) => i.id === a.checkinId)!;
      expect(minha).toMatchObject({ status: 'review', reason: 'Sinalizado por 1 participante' });
      expect(JSON.stringify(minha)).not.toContain('Bia');
      const membershipDaBia = await prisma.groupMembership.findFirstOrThrow({
        where: { groupId: a.groupId, userId: a.outro },
      });
      for (const segredo of [a.outro, membershipDaBia.id]) {
        expect(JSON.stringify(dela)).not.toContain(segredo);
      }

      // A fila é da equipe: o membro não abre.
      await expect(checkins.queue(a.outro, a.groupId)).rejects.toBeInstanceOf(ForbiddenException);
      const fila = await checkins.queue(a.prof, a.groupId);
      expect(fila).toMatchObject({ open: 1, limit: REVIEW_QUEUE_MAX });
      expect(fila.items[0]).toMatchObject({
        id: a.checkinId,
        type: 'photo',
        source: 'member',
        why: 'Sinalizado por 1 participante',
        flags: 1,
        workoutLinked: true,
      });
      expect(fila.items[0]!.photoUrl).toMatch(/^memory:\/\/get\//);

      await expect(
        checkins.resolve(a.prof, a.groupId, a.id, a.checkinId, { decision: 'void' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      avisos.length = 0;
      const arquivo = await prisma.challengeCheckin.findUniqueOrThrow({
        where: { id: a.checkinId },
        include: { photoFile: true },
      });
      await checkins.resolve(a.prof, a.groupId, a.id, a.checkinId, {
        decision: 'void',
        reason: 'A foto mostra o corpo',
      });
      const depois = await prisma.challengeCheckin.findUniqueOrThrow({
        where: { id: a.checkinId },
      });
      expect(depois).toMatchObject({ status: 'VOIDED', reason: 'A foto mostra o corpo' });
      expect(depois.photoFileId).toBeNull();
      expect(store.objects.has(arquivo.photoFile!.key)).toBe(false);
      expect(avisos).toEqual([
        expect.objectContaining({
          to: [a.membro],
          notice: expect.objectContaining({ body: 'Motivo da equipe: A foto mostra o corpo' }),
        }),
      ]);
      // Anulado some da atividade dos outros.
      const outros = await challenges.get(a.outro, a.groupId, a.id);
      expect(outros.activity.some((i) => i.id === a.checkinId)).toBe(false);
    });

    it('cada pessoa sinaliza até 3 por dia, e a fila cheia recusa', async () => {
      const a = await comCheckin();
      const ids: string[] = [];
      for (let i = 0; i < MEMBER_FLAGS_PER_DAY; i++) {
        const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
          where: { challengeId: a.id, displayName: 'Ana' },
        });
        const c = await prisma.challengeCheckin.create({
          data: {
            participantId: p.id,
            type: 'PHOTO',
            date: addDaysIso(hoje(), -(i + 1)),
          },
        });
        ids.push(c.id);
      }
      for (const id of ids) await checkins.flag(a.outro, a.groupId, a.id, id);
      const excesso = checkins.flag(a.outro, a.groupId, a.id, a.checkinId);
      await expect(excesso).rejects.toBeInstanceOf(HttpException);
      await expect(excesso).rejects.toMatchObject({ status: 429 });

      // Fila cheia: outro participante não consegue pôr mais um.
      const terceiro = await entra(a.groupId, 'MEMBER');
      await challenges.join(terceiro, a.groupId, a.id, 'Caio', { acceptPhotoTerms: true });
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: a.id, displayName: 'Ana' },
      });
      await prisma.challengeCheckin.createMany({
        data: Array.from({ length: REVIEW_QUEUE_MAX }, (_, i) => ({
          participantId: p.id,
          type: 'WATER' as const,
          date: `2000-01-${String((i % 28) + 1).padStart(2, '0')}`,
          status: 'FLAGGED' as const,
          flagSource: 'MEMBER' as const,
        })).filter((_, i) => i < 28),
        skipDuplicates: true,
      });
      await prisma.challengeCheckin.createMany({
        data: Array.from({ length: REVIEW_QUEUE_MAX - 28 }, (_, i) => ({
          participantId: p.id,
          type: 'STEPS' as const,
          date: `2000-02-${String(i + 1).padStart(2, '0')}`,
          status: 'FLAGGED' as const,
          flagSource: 'MEMBER' as const,
        })),
      });
      // Resposta neutra (#395 M3): quem sinaliza não descobre que a fila encheu. O
      // check-in segue valendo e a sinalização fica guardada.
      await expect(checkins.flag(terceiro, a.groupId, a.id, a.checkinId)).resolves.toEqual({
        flagged: true,
      });
      const segue = await prisma.challengeCheckin.findUniqueOrThrow({
        where: { id: a.checkinId },
      });
      expect(segue.status).toBe('VALID');
    });

    it('o check-in de outro desafio não se resolve pela URL deste', async () => {
      const a = await comCheckin();
      const outroDesafio = await emAndamento(a.groupId, a.dono, { kind: 'WATER' });
      await checkins.flag(a.outro, a.groupId, a.id, a.checkinId);
      await expect(
        checkins.resolve(a.prof, a.groupId, outroDesafio, a.checkinId, { decision: 'valid' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        checkins.flag(a.outro, a.groupId, outroDesafio, a.checkinId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('com a fila aberta, o pódio espera; decidido o último item, o resultado sai', async () => {
      const a = await comCheckin();
      await checkins.flag(a.outro, a.groupId, a.id, a.checkinId);
      await challenges.end(a.dono, a.groupId, a.id);
      const esperando = await challenges.get(a.membro, a.groupId, a.id);
      expect(esperando).toMatchObject({ status: 'ended', resultPending: true });
      expect(esperando.me!.medal).toBeNull();

      await checkins.resolve(a.prof, a.groupId, a.id, a.checkinId, { decision: 'valid' });
      const fechado = await challenges.get(a.membro, a.groupId, a.id);
      expect(fechado).toMatchObject({ resultPending: false });
      expect(fechado.me).toMatchObject({ score: 1, rank: 1, medal: 'gold' });
    });

    it('passadas 24 h do fim, fecha mesmo com a fila aberta', async () => {
      const a = await comCheckin();
      await checkins.flag(a.outro, a.groupId, a.id, a.checkinId);
      await prisma.groupChallenge.update({
        where: { id: a.id },
        data: { endsAt: new Date(Date.now() - REVIEW_GRACE_MS - 60_000) },
      });
      await challenges.finalizeDue();
      const row = await prisma.groupChallenge.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.finalizedAt).not.toBeNull();
    });
  });

  describe('retenção da foto (ADR 044 §7)', () => {
    async function comFoto() {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'PHOTO' });
      await challenges.join(a.membro, a.groupId, id, 'Ana', { acceptPhotoTerms: true });
      await treino(a.membro);
      const fileId = await foto(a.membro, a.groupId);
      await checkins.create(a.membro, a.groupId, id, { photoFileId: fileId });
      const key = (await prisma.mediaFile.findUniqueOrThrow({ where: { id: fileId } })).key;
      return { ...a, id, fileId, key };
    }

    it('sair do desafio apaga a foto na hora', async () => {
      const a = await comFoto();
      await challenges.leave(a.membro, a.groupId, a.id);
      expect(await prisma.mediaFile.findUnique({ where: { id: a.fileId } })).toBeNull();
      expect(store.objects.has(a.key)).toBe(false);
    });

    it('sair da comunidade apaga a foto na hora', async () => {
      const a = await comFoto();
      await memberships.leave(a.membro, a.groupId);
      expect(await prisma.mediaFile.findUnique({ where: { id: a.fileId } })).toBeNull();
      expect(store.objects.has(a.key)).toBe(false);
    });

    it('30 dias depois do fechamento, a foto sai; antes, fica', async () => {
      const a = await comFoto();
      await challenges.end(a.dono, a.groupId, a.id);
      await challenges.purgeExpiredPhotos();
      expect(store.objects.has(a.key)).toBe(true);
      await challenges.purgeExpiredPhotos(
        new Date(Date.now() + CHECKIN_PHOTO_RETENTION_MS + 60_000),
      );
      expect(store.objects.has(a.key)).toBe(false);
      expect(await prisma.mediaFile.findUnique({ where: { id: a.fileId } })).toBeNull();
    });

    it('a faxina de órfãos não leva a foto que está num check-in', async () => {
      const a = await comFoto();
      // A foto envelhece, não o relógio: adiantar o `now` da faxina levaria os
      // uploads pendentes de outros specs rodando ao mesmo tempo.
      await prisma.mediaFile.update({
        where: { id: a.fileId },
        data: { createdAt: new Date(Date.now() - 48 * 60 * 60_000) },
      });
      await media.purgeOrphans(new Date());
      expect(store.objects.has(a.key)).toBe(true);
    });
  });

  describe('"Me avise quando começar"', () => {
    it('avisa quem pediu e quem já entrou, uma vez só', async () => {
      const a = await comunidade();
      const marcado = await challenges.create(a.dono, a.groupId, {
        title: 'Dezembro hidratado',
        kind: 'WATER',
        startDate: addDaysIso(hoje(), 1),
        endDate: addDaysIso(hoje(), 3),
      });
      await challenges.watch(a.membro, a.groupId, marcado.id, true);
      await challenges.join(a.prof, a.groupId, marcado.id, 'Prof');
      expect((await challenges.get(a.membro, a.groupId, marcado.id)).watching).toBe(true);

      await prisma.groupChallenge.update({
        where: { id: marcado.id },
        data: { startsAt: new Date(Date.now() - 60_000) },
      });
      avisos.length = 0;
      await challenges.notifyStarted();
      await challenges.notifyStarted();
      const deste = avisos.filter((x) => x.notice.url.includes(marcado.id));
      expect(deste).toHaveLength(1);
      expect(deste[0]!.to.sort()).toEqual([a.membro, a.prof].sort());

      // Começou: não dá mais para pedir aviso.
      await expect(challenges.watch(a.dono, a.groupId, marcado.id, true)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('o meu progresso (get_my_challenge_progress)', () => {
    it('traz só os desafios em que a pessoa está e não acabaram, com o hoje dela', async () => {
      const a = await comunidade();
      const agua = await emAndamento(a.groupId, a.dono, { kind: 'WATER', waterGoalMl: 2000 });
      await emAndamento(a.groupId, a.dono, { kind: 'STEPS' });
      const acabou = await emAndamento(a.groupId, a.dono, { kind: 'WATER' });
      await prisma.waterLog.create({ data: { userId: a.membro, date: hoje(), ml: 2200 } });
      await challenges.join(a.membro, a.groupId, agua, 'Ana');
      await challenges.join(a.membro, a.groupId, acabou, 'Ana');
      await prisma.groupChallenge.update({
        where: { id: acabou },
        data: {
          endsAt: new Date(Date.now() - 48 * 3600_000),
          startsAt: new Date(Date.now() - 96 * 3600_000),
        },
      });

      const meus = await challenges.myProgress(a.membro, a.groupId);
      expect(meus).toEqual([
        expect.objectContaining({
          id: agua,
          kind: 'WATER',
          status: 'running',
          score: 1,
          rank: 1,
          streak: 1,
          totalDays: expect.any(Number),
          pendingReview: 0,
          today: expect.objectContaining({ points: 1 }),
        }),
      ]);
      // Quem não participa de nada recebe lista vazia; quem é de fora, 404.
      expect(await challenges.myProgress(a.prof, a.groupId)).toEqual([]);
      const b = await comunidade();
      await expect(challenges.myProgress(a.membro, b.groupId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('correções da revisão adversarial', () => {
    async function desafioDeFoto(input: Partial<ChallengeInput> = {}) {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'PHOTO', ...input });
      await challenges.join(a.membro, a.groupId, id, 'Ana', { acceptPhotoTerms: true });
      return { ...a, id };
    }
    const virada = () => dayBoundsInTz(hoje(), SP).start;
    /** Um treino gravado e fechado pelo servidor nos instantes dados. */
    const treinoEm = (userId: string, criado: Date, fim: Date, inicio = criado) =>
      prisma.workoutSession.create({
        data: {
          userId,
          planName: 'Push',
          fromPlan: true,
          startedAt: inicio,
          completedAt: fim,
          createdAt: criado,
          serverCompletedAt: fim,
        },
      });

    it('B2: o mesmo treino não vale dois dias (23h10 e 00h10)', async () => {
      const a = await desafioDeFoto();
      const t = await treinoEm(
        a.membro,
        new Date(virada().getTime() - 2 * 3600_000),
        new Date(virada().getTime() - 3600_000),
      );
      const as2310 = new Date(virada().getTime() - 50 * 60_000);
      const as0010 = new Date(virada().getTime() + 10 * 60_000);
      await checkins.create(
        a.membro,
        a.groupId,
        a.id,
        { photoFileId: await foto(a.membro, a.groupId) },
        as2310,
      );
      expect(await checkins.eligibility(a.membro, a.groupId, a.id, t.id, as0010)).toMatchObject({
        eligible: false,
        reason: 'workout_used',
      });
      await expect(
        checkins.create(
          a.membro,
          a.groupId,
          a.id,
          { photoFileId: await foto(a.membro, a.groupId), workoutSessionId: t.id },
          as0010,
        ),
      ).rejects.toMatchObject({ response: { code: 'workout_used' } });
    });

    it('B2: o dia do check-in é o do fuso do desafio, não o da pessoa', async () => {
      const a = await desafioDeFoto();
      await prisma.user.update({ where: { id: a.membro }, data: { timezone: 'Asia/Tokyo' } });
      // Ontem às 13h30 em SP: em Tóquio já é hoje, 01h30.
      const ontem = addDaysIso(hoje(), -1);
      const agora = new Date(dayBoundsInTz(ontem, SP).start.getTime() + 13.5 * 3600_000);
      await treinoEm(
        a.membro,
        new Date(agora.getTime() - 60 * 60_000),
        new Date(agora.getTime() - 10 * 60_000),
      );
      await checkins.create(
        a.membro,
        a.groupId,
        a.id,
        { photoFileId: await foto(a.membro, a.groupId) },
        agora,
      );
      const c = await prisma.challengeCheckin.findFirstOrThrow({
        where: { participant: { challengeId: a.id } },
      });
      expect(c.date).toBe(ontem);
    });

    it('B3/I7: sem medalha antes do resultado, nem no ranking nem no MCP; o MCP não leva a atividade', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      await treino(a.membro);
      const r = await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      await checkins.flag(outro, a.groupId, a.id, r.activity.find((i) => i.isMe)!.id);
      await treino(outro);
      await checkins.create(outro, a.groupId, a.id, { photoFileId: await foto(outro, a.groupId) });
      await challenges.end(a.dono, a.groupId, a.id);

      const esperando = await challenges.get(a.membro, a.groupId, a.id);
      expect(esperando).toMatchObject({ status: 'ended', resultPending: true });
      expect(esperando.leaderboard!.map((l) => l.medal)).toEqual([null, null]);

      const tool = new GetChallengeLeaderboardTool(challenges);
      const pelaIa = (await tool.execute({ groupId: a.groupId, challengeId: a.id }, {
        userId: outro,
      } as never)) as unknown as Record<string, unknown> & {
        leaderboard: Array<{ medal: unknown }>;
      };
      expect(pelaIa.leaderboard.map((l) => l.medal)).toEqual([null, null]);
      expect(pelaIa).not.toHaveProperty('activity');
      expect(JSON.stringify(pelaIa)).not.toMatch(/photoUrl|"at":/);
    });

    it('I1: quem revisa não decide o próprio check-in, e ele nem aparece na fila dele', async () => {
      const a = await desafioDeFoto();
      await challenges.join(a.prof, a.groupId, a.id, 'Prof', { acceptPhotoTerms: true });
      await treino(a.prof);
      const r = await checkins.create(a.prof, a.groupId, a.id, {
        photoFileId: await foto(a.prof, a.groupId),
      });
      const id = r.activity.find((i) => i.isMe)!.id;
      await checkins.flag(a.membro, a.groupId, a.id, id);

      expect((await checkins.queue(a.prof, a.groupId)).items).toEqual([]);
      await expect(
        checkins.resolve(a.prof, a.groupId, a.id, id, { decision: 'valid' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await checkins.queue(a.dono, a.groupId)).items.map((i) => i.id)).toEqual([id]);
      await checkins.resolve(a.dono, a.groupId, a.id, id, { decision: 'valid' });
    });

    it('I2: o "Vale" da equipe se mantém quando o servidor reconfere o treino', async () => {
      const a = await desafioDeFoto();
      const t = await treino(a.membro);
      const r = await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      const id = r.activity.find((i) => i.isMe)!.id;
      await prisma.workoutSession.update({
        where: { id: t.id },
        data: { notes: 'séries a mais', startedAt: new Date(t.startedAt.getTime() - 60_000) },
      });
      await velho(a.id);
      expect((await challenges.get(a.membro, a.groupId, a.id)).me).toMatchObject({ score: 0 });

      await checkins.resolve(a.dono, a.groupId, a.id, id, { decision: 'valid' });
      await velho(a.id);
      const depois = await challenges.get(a.membro, a.groupId, a.id);
      expect(depois.me).toMatchObject({ score: 1, pendingReview: 0 });
      expect((await prisma.challengeCheckin.findUniqueOrThrow({ where: { id } })).status).toBe(
        'VALID',
      );
    });

    it('I3: a duração vale pelo relógio do servidor, e o fim reescrito não libera', async () => {
      const a = await desafioDeFoto();
      // O servidor viu 10 min de treino; o cliente diz que começou 50 min antes.
      const fim = new Date(Date.now() - 5 * 60_000);
      await treinoEm(
        a.membro,
        new Date(fim.getTime() - 10 * 60_000),
        fim,
        new Date(fim.getTime() - 60 * 60_000),
      );
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        eligible: false,
        reason: 'too_short',
        workout: { minutes: 10 },
      });

      await prisma.workoutSession.deleteMany({ where: { userId: a.membro } });
      // 52 min de servidor, mas o `completedAt` foi reescrito para 30 min depois.
      const t = await treinoEm(a.membro, new Date(fim.getTime() - 52 * 60_000), fim);
      await prisma.workoutSession.update({
        where: { id: t.id },
        data: { completedAt: new Date(fim.getTime() - 30 * 60_000) },
      });
      expect(await checkins.eligibility(a.membro, a.groupId, a.id)).toMatchObject({
        eligible: false,
        reason: 'late_logged',
      });
    });

    it('I4: a água editada depois do prazo do dia não conta no desafio', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'WATER', waterGoalMl: 2000 });
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      const ontem = addDaysIso(hoje(), -1);
      const log = await prisma.waterLog.create({
        data: {
          userId: a.membro,
          date: ontem,
          ml: 500,
          loggedAt: new Date(dayBoundsInTz(ontem, SP).start.getTime() + 12 * 3600_000),
        },
      });
      // Hoje, bem depois do prazo de ontem, a pessoa edita o registro para a meta.
      await new WaterLogService(prisma).update(log.id, { ml: 2500 }, a.membro, SP);
      expect(
        (await prisma.waterLog.findUniqueOrThrow({ where: { id: log.id } })).editedAt,
      ).not.toBeNull();
      await velho(id);
      expect((await challenges.get(a.membro, a.groupId, id)).me).toMatchObject({ score: 0 });
    });

    it('I5: só se sinaliza com o desafio em andamento', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      await treino(a.membro);
      const r = await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      await challenges.end(a.dono, a.groupId, a.id);
      await expect(
        checkins.flag(outro, a.groupId, a.id, r.activity.find((i) => i.isMe)!.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('I6: com a fila cheia de sinalizações, o detector ainda entra e o dia não conta', async () => {
      const a = await comunidade();
      const id = await emAndamento(a.groupId, a.dono, { kind: 'STEPS', stepsGoal: 10_000 });
      await challenges.join(a.membro, a.groupId, id, 'Ana');
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, id, 'Bia');
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: id, displayName: 'Bia' },
      });
      await prisma.challengeCheckin.createMany({
        data: Array.from({ length: REVIEW_QUEUE_MAX }, (_, i) => ({
          participantId: p.id,
          type: 'PHOTO' as const,
          date: addDaysIso('2000-01-01', i),
          status: 'FLAGGED' as const,
          flagSource: 'MEMBER' as const,
        })),
      });
      const meioDia = (min: number) =>
        new Date(dayBoundsInTz(hoje(), SP).start.getTime() + (12 * 60 + min) * 60_000);
      await prisma.stepLog.createMany({
        data: [
          { userId: a.membro, date: hoje(), steps: 1_000, source: 'GARMIN', loggedAt: meioDia(0) },
          {
            userId: a.membro,
            date: hoje(),
            steps: 15_000,
            source: 'GARMIN',
            loggedAt: meioDia(10),
          },
        ],
      });
      await velho(id);
      const r = await challenges.get(a.membro, a.groupId, id);
      expect(r.me).toMatchObject({ score: 0, pendingReview: 1 });
    });

    it('M1: duas decisões ao mesmo tempo, só uma vale', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      await treino(a.membro);
      const r = await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      const id = r.activity.find((i) => i.isMe)!.id;
      await checkins.flag(outro, a.groupId, a.id, id);
      const [x, y] = await Promise.allSettled([
        checkins.resolve(a.dono, a.groupId, a.id, id, { decision: 'valid' }),
        checkins.resolve(a.prof, a.groupId, a.id, id, {
          decision: 'void',
          reason: 'Foto do corpo',
        }),
      ]);
      expect([x.status, y.status].sort()).toEqual(['fulfilled', 'rejected']);
      const rejeitado = [x, y].find((v) => v.status === 'rejected') as PromiseRejectedResult;
      expect(rejeitado.reason).toBeInstanceOf(ConflictException);
    });

    it('M2: as sinalizações em paralelo respeitam o limite de 3', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: a.id, displayName: 'Ana' },
      });
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const c = await prisma.challengeCheckin.create({
          data: { participantId: p.id, type: 'PHOTO', date: addDaysIso(hoje(), -(i + 1)) },
        });
        ids.push(c.id);
      }
      await Promise.allSettled(ids.map((id) => checkins.flag(outro, a.groupId, a.id, id)));
      const membership = await prisma.groupMembership.findFirstOrThrow({
        where: { groupId: a.groupId, userId: outro },
      });
      expect(
        await prisma.challengeCheckinFlag.count({ where: { membershipId: membership.id } }),
      ).toBe(MEMBER_FLAGS_PER_DAY);
    });

    it('M3: sinalizar check-in anulado responde igual, sem dizer que foi anulado', async () => {
      const a = await desafioDeFoto();
      const outro = await entra(a.groupId, 'MEMBER');
      await challenges.join(outro, a.groupId, a.id, 'Bia', { acceptPhotoTerms: true });
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: a.id, displayName: 'Ana' },
      });
      const c = await prisma.challengeCheckin.create({
        data: { participantId: p.id, type: 'PHOTO', date: hoje(), status: 'VOIDED' },
      });
      await expect(checkins.flag(outro, a.groupId, a.id, c.id)).resolves.toEqual({
        flagged: true,
      });
    });

    it('M4: a foto tirada antes de o treino começar não vale', async () => {
      const a = await desafioDeFoto();
      const t = await treino(a.membro);
      const f = await foto(a.membro, a.groupId);
      await prisma.mediaFile.update({
        where: { id: f },
        data: { createdAt: new Date(t.createdAt.getTime() - 5 * 60_000) },
      });
      await expect(
        checkins.create(a.membro, a.groupId, a.id, { photoFileId: f }),
      ).rejects.toMatchObject({ response: { code: 'photo_before_workout' } });
    });

    it('M5: a fila da comunidade pagina, sem esconder o que passa do 50º', async () => {
      const a = await desafioDeFoto();
      const p = await prisma.groupChallengeParticipant.findFirstOrThrow({
        where: { challengeId: a.id },
      });
      await prisma.challengeCheckin.createMany({
        data: Array.from({ length: REVIEW_QUEUE_MAX + 5 }, (_, i) => ({
          participantId: p.id,
          type: 'PHOTO' as const,
          date: addDaysIso('2000-01-01', i),
          status: 'FLAGGED' as const,
          flagSource: 'SYSTEM' as const,
          flaggedAt: new Date(Date.now() - (100 - i) * 60_000),
        })),
      });
      const primeira = await checkins.queue(a.dono, a.groupId);
      expect(primeira.items).toHaveLength(REVIEW_QUEUE_MAX);
      expect(primeira.open).toBe(REVIEW_QUEUE_MAX + 5);
      expect(primeira.nextCursor).toBeTruthy();
      const segunda = await checkins.queue(a.dono, a.groupId, undefined, primeira.nextCursor!);
      expect(segunda.items).toHaveLength(5);
      expect(segunda.nextCursor).toBeNull();
      const todos = new Set([...primeira.items, ...segunda.items].map((i) => i.id));
      expect(todos.size).toBe(REVIEW_QUEUE_MAX + 5);
    });

    it('M6: na atividade de outra pessoa vem só o dia, sem o horário', async () => {
      const a = await desafioDeFoto();
      await treino(a.membro);
      await checkins.create(a.membro, a.groupId, a.id, {
        photoFileId: await foto(a.membro, a.groupId),
      });
      const visitante = await challenges.get(a.prof, a.groupId, a.id);
      expect(visitante.activity.length).toBeGreaterThan(0);
      expect(visitante.activity.every((i) => i.at === null)).toBe(true);
      const dela = await challenges.get(a.membro, a.groupId, a.id);
      expect(dela.activity.find((i) => i.isMe)!.at).toBeTruthy();
    });

    it('M8: o desafio antigo de água somada ainda se edita antes de começar', async () => {
      const a = await comunidade();
      const c = await challenges.create(a.dono, a.groupId, {
        title: 'Antigo',
        startDate: addDaysIso(hoje(), 2),
        endDate: addDaysIso(hoje(), 9),
        metric: 'ACTIVE_DAYS',
      });
      await prisma.groupChallenge.update({ where: { id: c.id }, data: { metric: 'WATER_ML' } });
      const r = await challenges.update(a.dono, a.groupId, c.id, {
        title: 'Antigo, renomeado',
        startDate: addDaysIso(hoje(), 3),
        endDate: addDaysIso(hoje(), 9),
        metric: 'WATER_ML',
      });
      expect(r).toMatchObject({ title: 'Antigo, renomeado', kind: 'METRIC', metric: 'WATER_ML' });
    });
  });
});

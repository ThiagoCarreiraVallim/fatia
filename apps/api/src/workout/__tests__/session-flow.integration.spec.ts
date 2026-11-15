import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GroupRole, GroupType, MembershipStatus, ShareScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { SessionSetService } from '../session-set.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * A sessão do redesign (#377) contra o Postgres: iniciar de novo devolve a
 * aberta, a série reenviada não duplica, finalizar duas vezes não muda o fim,
 * a sensação e as perguntas da equipe gravam e o resumo do "Treino feito!" sai
 * do banco de verdade.
 */
describe('sessão de treino #377 (banco real)', () => {
  const prisma = new PrismaService();
  const sessions = new WorkoutSessionService(prisma);
  const sets = new SessionSetService(prisma);
  const stamp = `t377-${Date.now()}`;
  let userId: string;
  let proId: string;
  let groupId: string;
  let benchId: number;
  let planId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    const [user, pro] = await Promise.all([
      prisma.user.create({
        data: { logtoSub: `${stamp}-a`, email: `${stamp}-a@test.local`, name: 'Aluna' },
      }),
      prisma.user.create({
        data: { logtoSub: `${stamp}-p`, email: `${stamp}-p@test.local`, name: 'Helena Prado' },
      }),
    ]);
    userId = user.id;
    proId = pro.id;
    const bench = await prisma.exercise.create({
      data: {
        name: `${stamp}-supino`,
        muscleGroup: 'peito',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps'],
        createdByUserId: userId,
      },
    });
    benchId = bench.id;
    const plan = await prisma.workoutPlan.create({
      data: {
        userId,
        name: 'Push',
        exercises: { create: { exerciseId: benchId, order: 1, targetSets: 3, targetReps: '8-10' } },
      },
    });
    planId = plan.id;
    const group = await prisma.group.create({
      data: { type: GroupType.SPONSORED, name: stamp, slug: stamp, ownerId: proId },
    });
    groupId = group.id;
    await prisma.groupMembership.create({
      data: {
        groupId,
        userId: proId,
        role: GroupRole.PROFESSIONAL,
        status: MembershipStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.workoutSession.deleteMany({ where: { userId } });
    await prisma.workoutPlan.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, proId] } } });
    await prisma.$disconnect();
  });

  it('iniciar com outra aberta devolve 409 com o id da aberta no corpo', async () => {
    const aberta = await sessions.start(userId, { planId });
    const erro = await sessions.start(userId, {}).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      activeSessionId: aberta.id,
    });
    await prisma.workoutSession.delete({ where: { id: aberta.id } });
  });

  it('a mesma série reenviada (mesma clientKey) não duplica', async () => {
    const s = await sessions.start(userId, { planId });
    const corpo = { sessionId: s.id, exerciseId: benchId, weightKg: 50, reps: 10, clientKey: 'k1' };
    const [a, b] = await Promise.all([sets.create(userId, corpo), sets.create(userId, corpo)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.sessionSet.count({ where: { sessionId: s.id } })).toBe(1);
    // Outra chave é outra série.
    const c = await sets.create(userId, { ...corpo, clientKey: 'k2' });
    expect(c.id).not.toBe(a.id);
    expect(c.setNumber).toBe(2);
    await prisma.workoutSession.delete({ where: { id: s.id } });
  });

  it('corrigir ou apagar série pede a sessão da URL', async () => {
    const s1 = await sessions.start(userId, { planId });
    const set = await sets.create(userId, {
      sessionId: s1.id,
      exerciseId: benchId,
      weightKg: 40,
      reps: 8,
    });
    await sessions.finish(userId, s1.id, {});
    const s2 = await sessions.start(userId, {});
    // A série é da s1: pela URL da s2 não existe.
    await expect(sets.update(userId, set.id, { reps: 9 }, s2.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(sets.delete(userId, set.id, s2.id)).rejects.toThrow(NotFoundException);
    await expect(sets.update(userId, set.id, { reps: 9 }, s1.id)).resolves.toMatchObject({
      reps: 9,
    });
    await prisma.workoutSession.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
  });

  it('finalizar duas vezes não muda o fim, e a sensação grava', async () => {
    const s = await sessions.start(userId, { planId });
    const primeiro = await sessions.finish(userId, s.id, { feeling: 2 });
    const segundo = await sessions.finish(userId, s.id, { feeling: 3 });
    expect(segundo.completedAt).toEqual(primeiro.completedAt);
    expect(segundo.feeling).toBe(3);
    await prisma.workoutSession.delete({ where: { id: s.id } });
  });

  it('as perguntas gravam uma vez por sessão; pular apaga as respostas', async () => {
    const s = await sessions.start(userId, { planId });
    await expect(sessions.saveCheckin(userId, s.id, { fatigue: 3 })).rejects.toThrow(
      BadRequestException,
    );
    await sessions.finish(userId, s.id, {
      checkin: { fatigue: 4, pain: true, painLocation: 'joelho' },
    });
    await sessions.saveCheckin(userId, s.id, { fatigue: 5, pain: false });
    const respostas = await prisma.workoutCheckin.findMany({ where: { sessionId: s.id } });
    expect(respostas).toHaveLength(1);
    expect(respostas[0]).toMatchObject({
      userId,
      fatigue: 5,
      pain: false,
      painLocation: null,
      skipped: false,
    });

    await sessions.saveCheckin(userId, s.id, { skipped: true, fatigue: 2 });
    expect(await prisma.workoutCheckin.findUnique({ where: { sessionId: s.id } })).toMatchObject({
      skipped: true,
      fatigue: null,
      pain: null,
    });
    await prisma.workoutSession.delete({ where: { id: s.id } });
  });

  it('o resumo compara com o último do plano, acha o recorde e só pergunta com equipe de Treino', async () => {
    const antes = await sessions.start(userId, {
      planId,
      startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    });
    await sets.create(userId, { sessionId: antes.id, exerciseId: benchId, weightKg: 50, reps: 10 });
    await sessions.finish(userId, antes.id, {
      completedAt: new Date(Date.now() - 3 * 86_400_000 + 50 * 60_000).toISOString(),
    });

    const hoje = await sessions.start(userId, {
      planId,
      startedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    });
    await sets.create(userId, {
      sessionId: hoje.id,
      exerciseId: benchId,
      weightKg: 52.5,
      reps: 10,
      rpe: 8,
    });
    await sessions.finish(userId, hoje.id, {});

    const semEquipe = await sessions.summary(userId, hoje.id);
    expect(semEquipe.comparison?.sessionId).toBe(antes.id);
    expect(semEquipe.records.map((r) => r.exerciseId)).toEqual([benchId]);
    expect(semEquipe.exercises[0]).toMatchObject({ feeling: 3, isRecord: true });
    expect(semEquipe.questions).toBeNull();
    expect(semEquipe.checkin).toBeNull();

    // Vínculo só de Alimentação: ainda sem perguntas.
    const membership = await prisma.groupMembership.create({
      data: { groupId, userId, role: GroupRole.MEMBER, status: MembershipStatus.ACTIVE },
    });
    const link = await prisma.professionalLink.create({
      data: {
        subjectUserId: userId,
        professionalId: proId,
        groupId,
        scopes: [ShareScope.NUTRITION],
      },
    });
    expect((await sessions.summary(userId, hoje.id)).questions).toBeNull();

    await prisma.professionalLink.update({
      where: { id: link.id },
      data: { scopes: [ShareScope.WORKOUT] },
    });
    const comEquipe = await sessions.summary(userId, hoje.id);
    expect(comEquipe.questions?.askedBy).toEqual(['Helena Prado']);
    expect(comEquipe.questions?.items.map((q) => q.key)).toEqual(['fatigue', 'pain']);

    // Revogado: some.
    await prisma.professionalLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    expect((await sessions.summary(userId, hoje.id)).questions).toBeNull();
    await prisma.groupMembership.delete({ where: { id: membership.id } });
  });

  it('números do exercício: recorde, última vez e máximo estimado', async () => {
    const stats = await sets.exerciseStats(userId, benchId);
    expect(stats.record).toMatchObject({ weightKg: 52.5, reps: 10 });
    expect(stats.last).toMatchObject({ sets: 1, best: { weightKg: 52.5, reps: 10 }, feeling: 3 });
    expect(stats.estimated1RM).toBeGreaterThan(52.5);
  });
});

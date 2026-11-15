import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { normalizeSearchText } from '../../common/search-text';
import { PlanMaterializerService } from '../../sharing/plan-materializer.service';
import { buildPlanSnapshot } from '../../sharing/plan-snapshot';
import { ExerciseService } from '../exercise.service';
import { WorkoutPlanService } from '../workout-plan.service';
import { WorkoutSessionService } from '../workout-session.service';

/**
 * Planos e exercício configurado (#378), contra o banco real: o critério de
 * pronto da issue é "cria um plano, adiciona o mesmo exercício duas vezes,
 * define descanso e técnica, configura uma esteira por distância, salva, inicia
 * o treino e a sessão usa o descanso e a meta configurados".
 */
describe('Plano com exercício configurado (#378, banco real)', () => {
  const prisma = new PrismaService();
  const exercises = new ExerciseService(prisma);
  const plans = new WorkoutPlanService(prisma);
  const sessions = new WorkoutSessionService(prisma);
  const materializer = new PlanMaterializerService(prisma, exercises);
  const stamp = `plano-378-${Date.now()}`;
  let userId: string;
  let otherId: string;
  let strengthId: number;
  let cardioId: number;
  let otherCustomId: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL do banco de teste.');
    userId = (
      await prisma.user.create({
        data: { logtoSub: stamp, email: `${stamp}@test.local`, name: 'Treino' },
      })
    ).id;
    otherId = (
      await prisma.user.create({
        data: { logtoSub: `${stamp}-b`, email: `${stamp}-b@test.local`, name: 'Vizinho' },
      })
    ).id;
    // Exercícios do próprio teste, para não depender do seed do catálogo.
    strengthId = (
      await prisma.exercise.create({
        data: {
          name: `${stamp} Elevação lateral`,
          muscleGroup: 'ombro',
          searchName: normalizeSearchText(`${stamp} Elevação lateral`),
        },
      })
    ).id;
    cardioId = (
      await prisma.exercise.create({
        data: {
          name: `${stamp} Esteira`,
          muscleGroup: 'cardio',
          searchName: normalizeSearchText(`${stamp} Esteira`),
        },
      })
    ).id;
    otherCustomId = (
      await exercises.createCustom(otherId, { name: `${stamp} do vizinho`, muscleGroup: 'peito' })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await prisma.exercise.deleteMany({ where: { id: { in: [strengthId, cardioId] } } });
    await prisma.$disconnect();
  });

  it('critério de pronto: o mesmo exercício duas vezes, descanso, técnica e esteira por distância chegam à sessão', async () => {
    const plan = await plans.create(userId, { name: 'Push' });
    const a = await plans.addExercise(userId, plan.id, {
      exerciseId: strengthId,
      targetSets: 3,
      targetReps: '12-15',
      restSeconds: 60,
      technique: 'DROP_SET',
      startLoadKg: 8.5,
      notes: 'pegada neutra',
    });
    // De novo o mesmo exercício: antes da #378 o único (planId, exerciseId) dava 409.
    const b = await plans.addExercise(userId, plan.id, {
      exerciseId: strengthId,
      targetSets: 2,
      targetReps: '20',
      restSeconds: 45,
    });
    const c = await plans.addExercise(userId, plan.id, { exerciseId: cardioId });
    await plans.updatePlanExercise(userId, plan.id, c.id, {
      cardioTarget: 'DISTANCE',
      cardioDistanceMeters: 3000,
      cardioIntensity: 'MODERATE',
    });

    expect(a.id).not.toBe(b.id);
    expect(b.order).toBeGreaterThan(a.order);
    expect(c.order).toBeGreaterThan(b.order);

    const session = await sessions.start(userId, { planId: plan.id });
    const view = await sessions.findById(userId, session.id);
    expect(view.plannedExercises).toHaveLength(3);
    expect(view.plannedExercises[0]).toMatchObject({
      planExerciseId: a.id,
      exerciseId: strengthId,
      restSeconds: 60,
      technique: 'DROP_SET',
      startLoadKg: 8.5,
      notes: 'pegada neutra',
    });
    expect(view.plannedExercises[1]).toMatchObject({ planExerciseId: b.id, restSeconds: 45 });
    expect(view.plannedExercises[2]).toMatchObject({
      exerciseId: cardioId,
      cardioTarget: 'DISTANCE',
      cardioDistanceMeters: 3000,
      cardioIntensity: 'MODERATE',
    });
    await sessions.finish(userId, session.id, {});
  });

  it('faixa de repetições com mínimo acima do máximo é 400, e nada muda', async () => {
    const plan = await plans.create(userId, { name: 'Faixa' });
    const pe = await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    await expect(
      plans.updatePlanExercise(userId, plan.id, pe.id, { targetReps: '15-8' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      plans.addExercise(userId, plan.id, { exerciseId: strengthId, targetReps: '12–10' }),
    ).rejects.toThrow(BadRequestException);
    const row = await prisma.workoutPlanExercise.findUnique({ where: { id: pe.id } });
    expect(row?.targetReps).toBe(pe.targetReps);
  });

  it('meta de cardio em exercício de força é 400', async () => {
    const plan = await plans.create(userId, { name: 'Sem cardio' });
    const pe = await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    await expect(
      plans.updatePlanExercise(userId, plan.id, pe.id, {
        cardioTarget: 'TIME',
        cardioDurationSeconds: 1200,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('meta por distância sem distância é 400', async () => {
    const plan = await plans.create(userId, { name: 'Sem distância' });
    const pe = await plans.addExercise(userId, plan.id, { exerciseId: cardioId });
    await expect(
      plans.updatePlanExercise(userId, plan.id, pe.id, { cardioTarget: 'DISTANCE' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('série por série: substitui a tabela e recalcula séries e faixa', async () => {
    const plan = await plans.create(userId, { name: 'Pirâmide' });
    const pe = await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    const updated = await plans.updatePlanExercise(userId, plan.id, pe.id, {
      sets: [
        { kind: 'WARMUP', reps: 15, loadKg: 6 },
        { kind: 'NORMAL', reps: 12, loadKg: 8 },
        { kind: 'NORMAL', reps: 10, loadKg: 10 },
        { kind: 'DROP', reps: 8, loadKg: 8 },
      ],
    });
    expect(updated.targetSets).toBe(4);
    // O aquecimento fica fora da faixa: ela é a do trabalho.
    expect(updated.targetReps).toBe('8-12');
    expect(updated.sets.map((s) => [s.order, s.kind, s.reps, s.loadKg])).toEqual([
      [1, 'WARMUP', 15, 6],
      [2, 'NORMAL', 12, 8],
      [3, 'NORMAL', 10, 10],
      [4, 'DROP', 8, 8],
    ]);

    // Gravar de novo substitui (não soma), e voltar ao modo simples limpa a tabela.
    const again = await plans.updatePlanExercise(userId, plan.id, pe.id, {
      sets: [{ kind: 'NORMAL', reps: 5, loadKg: 20 }],
    });
    expect(again.sets).toHaveLength(1);
    const simple = await plans.updatePlanExercise(userId, plan.id, pe.id, {
      targetSets: 3,
      targetReps: '8-10',
    });
    expect(simple.sets).toHaveLength(0);
    expect(await prisma.workoutPlanExerciseSet.count({ where: { planExerciseId: pe.id } })).toBe(0);
  });

  it('adiciona vários de uma vez, no fim, e recusa o lote inteiro se um id não é visível', async () => {
    const plan = await plans.create(userId, { name: 'Lote' });
    await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    const after = await plans.addExercises(userId, plan.id, {
      exercises: [{ exerciseId: cardioId }, { exerciseId: strengthId }],
    });
    expect(after.exercises.map((e) => e.exerciseId)).toEqual([strengthId, cardioId, strengthId]);
    // Cardio entra com uma série e sem faixa de repetições.
    expect(after.exercises[1]).toMatchObject({ targetSets: 1, targetReps: '' });

    await expect(
      plans.addExercises(userId, plan.id, {
        exercises: [{ exerciseId: strengthId }, { exerciseId: otherCustomId }],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(await prisma.workoutPlanExercise.count({ where: { planId: plan.id } })).toBe(3);
  });

  it('o retrato do plano leva a configuração e o exercício repetido, e a adoção copia', async () => {
    const plan = await plans.create(userId, { name: 'Modelo' });
    await plans.addExercise(userId, plan.id, {
      exerciseId: strengthId,
      restSeconds: 75,
      technique: 'TO_FAILURE',
      biSetWithNext: true,
    });
    const second = await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    await plans.updatePlanExercise(userId, plan.id, second.id, {
      sets: [
        { kind: 'WARMUP', reps: 15 },
        { kind: 'NORMAL', reps: 10, loadKg: 12.5 },
      ],
    });
    await plans.addExercise(userId, plan.id, {
      exerciseId: cardioId,
      cardioTarget: 'TIME',
      cardioDurationSeconds: 1200,
      cardioIntensity: 'LIGHT',
    });
    const full = await plans.findById(userId, plan.id);
    const snapshot = buildPlanSnapshot(full);
    expect(snapshot.exercises).toHaveLength(3);

    const copy = await materializer.materialize(otherId, snapshot);
    expect(copy.exercises).toHaveLength(3);
    expect(copy.exercises[0]).toMatchObject({
      restSeconds: 75,
      technique: 'TO_FAILURE',
      biSetWithNext: true,
    });
    expect(copy.exercises[1].sets.map((s) => [s.kind, s.reps, s.loadKg])).toEqual([
      ['WARMUP', 15, null],
      ['NORMAL', 10, 12.5],
    ]);
    expect(copy.exercises[2]).toMatchObject({
      cardioTarget: 'TIME',
      cardioDurationSeconds: 1200,
      cardioIntensity: 'LIGHT',
    });
  });

  it('plano mostra quantas vezes foi feito e quando foi o último', async () => {
    const plan = await plans.create(userId, { name: 'Contado' });
    await plans.addExercise(userId, plan.id, { exerciseId: strengthId });
    const s = await sessions.start(userId, { planId: plan.id });
    await sessions.finish(userId, s.id, {});
    const read = await plans.findById(userId, plan.id);
    expect(read.timesDone).toBe(1);
    expect(read.lastDoneAt).toBeInstanceOf(Date);
    const listed = (await plans.list(userId)).find((p) => p.id === plan.id);
    expect(listed?.timesDone).toBe(1);
  });

  describe('favoritos de exercício', () => {
    it('marcar e desmarcar é idempotente, inclusive ao mesmo tempo', async () => {
      const results = await Promise.allSettled([
        exercises.setFavorite(userId, strengthId, true),
        exercises.setFavorite(userId, strengthId, true),
        exercises.setFavorite(userId, strengthId, true),
      ]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(
        await prisma.favoriteExercise.count({ where: { userId, exerciseId: strengthId } }),
      ).toBe(1);

      await exercises.setFavorite(userId, strengthId, false);
      await exercises.setFavorite(userId, strengthId, false);
      expect(await prisma.favoriteExercise.count({ where: { userId } })).toBe(0);
    });

    it('não favorita o exercício pessoal de outra conta (404) e não grava nada', async () => {
      await expect(exercises.setFavorite(userId, otherCustomId, true)).rejects.toThrow(
        NotFoundException,
      );
      expect(await prisma.favoriteExercise.count({ where: { exerciseId: otherCustomId } })).toBe(0);
    });

    it('a busca marca o favorito, filtra só favoritos e põe o favorito primeiro', async () => {
      await exercises.setFavorite(userId, cardioId, true);
      const onlyFavs = await exercises.search(userId, { favoritesOnly: true });
      expect(onlyFavs.map((e) => e.id)).toEqual([cardioId]);
      expect(onlyFavs[0].favorite).toBe(true);

      // Com termo que casa os dois, o favorito vem antes.
      const both = await exercises.search(userId, { q: stamp });
      expect(both.map((e) => e.id)[0]).toBe(cardioId);
      expect(both.find((e) => e.id === strengthId)?.favorite).toBe(false);

      // O detalhe diz se é favorito (a estrela do Como fazer).
      expect((await exercises.getWithMedia(userId, cardioId)).favorite).toBe(true);
      expect((await exercises.getWithMedia(otherId, cardioId)).favorite).toBe(false);

      // O vizinho não vê o favorito de ninguém.
      expect(await exercises.search(otherId, { favoritesOnly: true })).toEqual([]);
      await exercises.setFavorite(userId, cardioId, false);
    });
  });
});

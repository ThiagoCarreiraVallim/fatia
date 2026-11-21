import { PrismaService } from '../../common/prisma.service';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { ExerciseService } from '../../workout/exercise.service';
import { WorkoutPlanService } from '../../workout/workout-plan.service';
import { PrescriptionService } from '../../workout/prescription.service';
import { SessionSetService } from '../../workout/session-set.service';
import { GroupExerciseService } from '../group-exercise.service';
import { GroupService } from '../group.service';
import { ProfessionalLinkService } from '../professional-link.service';

/** Revisão adversarial da #466 (#408). */
describe('revisão adversarial da #466 (#408)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const exercises = new ExerciseService(prisma, media);
  const plans = new WorkoutPlanService(prisma);
  const catalog = new GroupExerciseService(prisma, media);
  const prescription = new PrescriptionService(prisma, new SessionSetService(prisma));
  const groups = new GroupService(
    prisma,
    new ProfessionalLinkService(prisma),
    [{ beforeDelete: (groupId) => exercises.beforeDeleteGroup(groupId) }],
    media,
  );

  const stamp = `rev466-${Date.now()}`;
  const createdUsers: string[] = [];
  const groupIds: string[] = [];
  let n = 0;
  let squat: { id: number; name: string; mechanic: string | null };

  async function person(name = 'Pessoa') {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `${name} ${n}` },
    });
    createdUsers.push(user.id);
    return user.id;
  }
  async function join(
    groupId: string,
    role: 'MEMBER' | 'PROFESSIONAL' | 'CREATOR',
    userId?: string,
  ) {
    const id = userId ?? (await person(role));
    await prisma.groupMembership.create({
      data: { groupId, userId: id, role, status: 'ACTIVE', joinedAt: new Date() },
    });
    return id;
  }
  async function community(name = 'Academia') {
    const owner = await person('Dona');
    const g = await groups.create(owner, { type: 'SPONSORED', name });
    groupIds.push(g.id);
    return { groupId: g.id, owner, prof: await join(g.id, 'PROFESSIONAL') };
  }

  function box(type: string, body: Buffer): Buffer {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  }
  /** MP4 fragmentado (ffmpeg -movflags frag_keyframe): mvhd 0, a duração no mehd. */
  function fragmentedMp4(seconds: number): Buffer {
    const ftyp = box('ftyp', Buffer.from('iso5\0\0\0\0iso5iso6mp41', 'latin1'));
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(1000, 12); // timescale
    mvhd.writeUInt32BE(0, 16); // duration 0: é assim no fragmentado
    const mehd = Buffer.alloc(8);
    mehd.writeUInt32BE(seconds * 1000, 4);
    const moov = box(
      'moov',
      Buffer.concat([
        box('mvhd', mvhd),
        box('trak', Buffer.alloc(16)),
        box('mvex', box('mehd', mehd)),
      ]),
    );
    const frags: Buffer[] = [];
    for (let i = 0; i < 10; i++) {
      frags.push(box('moof', Buffer.alloc(32)), box('mdat', Buffer.alloc(1024)));
    }
    return Buffer.concat([ftyp, moov, ...frags]);
  }

  beforeAll(async () => {
    squat = await prisma.exercise.findFirstOrThrow({
      where: {
        createdByUserId: null,
        groupOwned: false,
        muscleGroup: 'pernas',
        mechanic: 'compound',
      },
      select: { id: true, name: true, mechanic: true },
      orderBy: { id: 'asc' },
    });
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.workoutSession.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.workoutPlan.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.exercise.deleteMany({ where: { groupOwned: true, name: { contains: stamp } } });
    await prisma.exercise.deleteMany({
      where: { name: { contains: '(cópia' }, groupId: null, groupOwned: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
  });

  it('F1: "em N planos" não conta o plano pessoal do membro nem o que veio de outra comunidade', async () => {
    const a = await community('A');
    const b = await community('B');
    // Uma só pessoa, membro de A e de B. O plano dela é pessoal (ou veio de B).
    const member = await join(a.groupId, 'MEMBER');
    await join(b.groupId, 'MEMBER', member);
    // Quem só publica conteúdo em A (CREATOR): não tem leitura de dado de ninguém.
    const creator = await join(a.groupId, 'CREATOR');

    const before = await catalog.getForTeam(creator, a.groupId, squat.id);
    expect(before.usage?.plans.band).toBe('none');

    const p = await plans.create(member, { name: 'Meu treino pessoal' });
    await plans.addExercise(member, p.id, {
      exerciseId: squat.id,
      order: 0,
      targetSets: 3,
      targetReps: '10',
    });

    // Nada de A está nesse plano: A não deveria saber que ele existe.
    const after = await catalog.getForTeam(creator, a.groupId, squat.id);
    expect(after.usage?.plans.band).toBe('none');
  });

  it('F2: vídeo do exercício fragmentado de 10 min não passa no confirm (teto de 60 s)', async () => {
    const a = await community();
    const body = fragmentedMp4(600);
    const r = await media.requestUpload(a.prof, {
      purpose: 'exercise_video',
      groupId: a.groupId,
      mime: 'video/mp4',
      bytes: body.length,
    });
    const f = await prisma.mediaFile.findUniqueOrThrow({ where: { id: r.fileId } });
    store.upload(f.key, body, 'video/mp4');
    await expect(media.confirm(a.prof, r.fileId)).rejects.toThrow(/60 s/);
  });

  it('F3: a lista da equipe no app ("team") traz todos os da comunidade, não só os 200 primeiros do catálogo', async () => {
    const a = await community();
    const HOUSE = 195;
    for (let i = 0; i < HOUSE; i++) {
      const name = `Casa ${String(i).padStart(3, '0')} ${stamp}`;
      await prisma.exercise.create({
        data: {
          name,
          searchName: name.toLowerCase(),
          muscleGroup: 'pernas',
          groupOwned: true,
          groupId: a.groupId,
          groupGuides: { create: { groupId: a.groupId, authorId: a.prof } },
        },
      });
    }
    // Dez estrelas em exercícios do catálogo geral, sem guia.
    const general = await prisma.exercise.findMany({
      where: { createdByUserId: null, groupOwned: false },
      take: 10,
      select: { id: true },
    });
    for (const e of general) await catalog.setFavorite(a.prof, a.groupId, e.id, true);

    // A tela do app (apps/mobile/app/(app)/org/[groupId]/exercises/index.tsx)
    // pede só os da equipe ao servidor: os 10 favoritos do geral sem guia não
    // entram, e nenhum da casa fica de fora pelo limite.
    const filters = { team: true, limit: 200 } as Parameters<typeof catalog.listForTeam>[2];
    const page = await catalog.listForTeam(a.prof, a.groupId, filters);
    expect(page.items).toHaveLength(HOUSE);
    expect(page.count).toBe(HOUSE);
    expect(page.items.every((i) => i.hasGuide || i.ownedByCommunity)).toBe(true);
  }, 60_000);

  it('F4: a cópia ("Duplicar") não herda o histórico do original na prescrição de carga', async () => {
    const a = await community();
    const member = await join(a.groupId, 'MEMBER');
    // Duas sessões concluídas no original.
    for (let d = 2; d >= 1; d--) {
      const startedAt = new Date(Date.now() - d * 86_400_000);
      await prisma.workoutSession.create({
        data: {
          userId: member,
          startedAt,
          completedAt: new Date(startedAt.getTime() + 3_600_000),
          sets: {
            create: [1, 2, 3].map((setNumber) => ({
              exerciseId: squat.id,
              setNumber,
              weightKg: 100,
              reps: 10,
            })),
          },
        },
      });
    }
    expect((await prescription.forExercise(member, squat.id, '10')).status).toBe('ok');

    // A equipe duplica para fazer uma variação (que ela vai renomear/ajustar).
    const copy = await catalog.duplicate(a.prof, a.groupId, squat.id);
    await catalog.update(a.prof, a.groupId, copy.exerciseId, {
      name: `Agachamento búlgaro com halteres ${stamp}`,
    });
    // O membro nunca fez a variação: não há histórico dela.
    expect((await prescription.forExercise(member, copy.exerciseId, '10')).status).toBe(
      'insufficient_history',
    );
  });
});

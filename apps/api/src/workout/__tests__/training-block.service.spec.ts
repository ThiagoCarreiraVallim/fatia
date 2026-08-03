import { ConflictException, NotFoundException } from '@nestjs/common';
import { TrainingBlockService } from '../training-block.service';
import type { PrismaService } from '../../common/prisma.service';
import { BLOCK_TEMPLATE } from '../helpers/block-template';

/**
 * Fuso real, helpers reais. Nada de `jest.mock('../../progress/helpers/date-tz')`:
 * um spec que mocka o helper de fuso não pega bug de fuso, e a âncora do bloco é
 * "segunda-feira **no fuso do usuário**" — exatamente o que deslizaria.
 */
const TZ = 'America/Sao_Paulo';
const CTX = { userId: 'user-A', timezone: TZ };

interface FakeSet {
  exerciseId: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

interface FakeSession {
  userId: string;
  startedAt: Date;
  completedAt: Date | null;
  sets: FakeSet[];
}

interface FakeWeek {
  weekNumber: number;
  focus: string;
  intensityFactor: number;
  volumeFactor: number;
  weekStart: string;
  sessionsTarget: number;
}

interface FakeBlock {
  id: string;
  userId: string;
  planId: string | null;
  plan: { name: string } | null;
  kind: string;
  startDate: string;
  weeksTotal: number;
  status: string;
  createdAt: Date;
  weeks: FakeWeek[];
}

/**
 * Prisma falso que **obedece ao `where`** em vez de devolver lista pronta.
 *
 * É a diferença entre testar a regra e testar a fixture: um mock que devolve a
 * lista já filtrada não distingue "o service filtrou sessão em andamento" de "o
 * autor do teste filtrou". Aqui a fixture tem a sessão em andamento dentro, e o
 * filtro é o do código.
 */
function fakePrisma(options: {
  sessions?: FakeSession[];
  blocks?: FakeBlock[];
  planExerciseIds?: number[];
  plans?: Array<{ id: string; userId: string; name: string }>;
  weeklyWorkouts?: number | null;
}) {
  const sessions = options.sessions ?? [];
  const blocks = options.blocks ?? [];
  const plans = options.plans ?? [];

  const matchSet = (set: FakeSet, filter: Record<string, unknown>): boolean => {
    const exerciseId = filter.exerciseId as { in: number[] } | undefined;
    if (exerciseId && !exerciseId.in.includes(set.exerciseId)) return false;
    if (filter.weightKg && set.weightKg === null) return false;
    if (filter.reps && set.reps === null) return false;
    return true;
  };

  const workoutSession = {
    findMany: jest.fn(
      async (args: {
        where: Record<string, unknown>;
        orderBy?: { startedAt: 'asc' | 'desc' };
        take?: number;
        select?: { sets?: { where?: Record<string, unknown> } };
      }) => {
        const where = args.where;
        let rows = sessions.filter((s) => s.userId === where.userId);

        const completedAt = where.completedAt as { not?: null; gte?: Date; lt?: Date } | undefined;
        if (completedAt) {
          // `NULL >= x` é falso no Postgres — o fake reproduz isso em vez de
          // deixar a sessão em andamento passar por descuido do mock.
          if ('not' in completedAt) rows = rows.filter((s) => s.completedAt !== null);
          if (completedAt.gte) {
            rows = rows.filter((s) => s.completedAt !== null && s.completedAt >= completedAt.gte!);
          }
          if (completedAt.lt) {
            rows = rows.filter((s) => s.completedAt !== null && s.completedAt < completedAt.lt!);
          }
        }

        const startedAt = where.startedAt as { gte?: Date; lt?: Date } | undefined;
        if (startedAt?.gte) rows = rows.filter((s) => s.startedAt >= startedAt.gte!);
        if (startedAt?.lt) rows = rows.filter((s) => s.startedAt < startedAt.lt!);

        const sets = where.sets as { some?: Record<string, unknown> } | undefined;
        if (sets?.some) rows = rows.filter((s) => s.sets.some((set) => matchSet(set, sets.some!)));

        if (args.orderBy?.startedAt === 'desc') {
          rows = [...rows].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
        }
        if (args.take) rows = rows.slice(0, args.take);

        const setFilter = args.select?.sets?.where;
        return rows.map((s) => ({
          completedAt: s.completedAt,
          startedAt: s.startedAt,
          sets: setFilter ? s.sets.filter((set) => matchSet(set, setFilter)) : s.sets,
        }));
      },
    ),
  };

  const trainingBlock = {
    // Campo ausente no `where` é filtro ausente, e não `undefined === valor`. Sem
    // isto, tirar o `userId` da guarda do `abandon` continuaria devolvendo `null` —
    // o mock defenderia o isolamento no lugar do código.
    findFirst: jest.fn(
      async (args: { where: { id?: string; userId?: string; status?: string } }) =>
        blocks.find(
          (b) =>
            (args.where.id === undefined || b.id === args.where.id) &&
            (args.where.userId === undefined || b.userId === args.where.userId) &&
            (args.where.status === undefined || b.status === args.where.status),
        ) ?? null,
    ),
    findMany: jest.fn(async (args: { where: { userId: string; status?: string } }) =>
      blocks.filter(
        (b) =>
          b.userId === args.where.userId && (!args.where.status || b.status === args.where.status),
      ),
    ),
    count: jest.fn(
      async (args: { where: { userId: string; status?: string } }) =>
        blocks.filter(
          (b) =>
            b.userId === args.where.userId &&
            (!args.where.status || b.status === args.where.status),
        ).length,
    ),
    update: jest.fn(async (args: { where: { id: string }; data: { status?: string } }) => {
      const alvo = blocks.find((b) => b.id === args.where.id);
      if (alvo && args.data.status) alvo.status = args.data.status;
      return alvo;
    }),
    create: jest.fn(
      async (args: {
        data: {
          userId: string;
          planId: string | null;
          kind: string;
          startDate: string;
          weeksTotal: number;
          weeks: { create: FakeWeek[] };
        };
      }) => ({
        id: 'block-novo',
        userId: args.data.userId,
        planId: args.data.planId,
        plan: plans.find((p) => p.id === args.data.planId) ?? null,
        kind: args.data.kind,
        startDate: args.data.startDate,
        weeksTotal: args.data.weeksTotal,
        status: 'active',
        createdAt: new Date(),
        weeks: args.data.weeks.create,
      }),
    ),
  };

  return {
    trainingBlock,
    workoutSession,
    workoutPlan: {
      findFirst: jest.fn(
        async (args: { where: { id: string; userId: string } }) =>
          plans.find((p) => p.id === args.where.id && p.userId === args.where.userId) ?? null,
      ),
    },
    workoutPlanExercise: {
      findMany: jest.fn(async () =>
        (options.planExerciseIds ?? []).map((exerciseId) => ({ exerciseId })),
      ),
    },
    userGoals: {
      findUnique: jest.fn(async () =>
        options.weeklyWorkouts === undefined ? null : { weeklyWorkouts: options.weeklyWorkouts },
      ),
    },
  };
}

type FakePrisma = ReturnType<typeof fakePrisma>;

const makeService = (prisma: FakePrisma) =>
  new TrainingBlockService(prisma as unknown as PrismaService);

/** Bloco ancorado na segunda 2026-01-05, com as 4 semanas do template. */
function bloco(overrides: Partial<FakeBlock> = {}): FakeBlock {
  return {
    id: 'block-1',
    userId: 'user-A',
    planId: null,
    plan: null,
    kind: 'hypertrophy',
    startDate: '2026-01-05',
    weeksTotal: 4,
    status: 'active',
    createdAt: new Date('2026-01-05T12:00:00Z'),
    weeks: BLOCK_TEMPLATE.map((week) => ({
      weekNumber: week.weekNumber,
      focus: week.focus,
      intensityFactor: week.intensityFactor,
      volumeFactor: week.volumeFactor,
      weekStart: ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'][week.weekNumber - 1],
      sessionsTarget: 3,
    })),
    ...overrides,
  };
}

/**
 * O bloco como ele ficaria no banco, montado a partir do que o `create` gravou.
 *
 * Ler de volta o que o próprio service escreveu é o que faz o teste enxergar o dia
 * seguinte: um fixture escrito à mão traria a âncora que o autor do teste acha
 * certa, não a que o código gravou.
 */
function blocoCriado(prisma: FakePrisma): FakeBlock {
  const data = prisma.trainingBlock.create.mock.calls[0][0].data;
  return bloco({
    planId: data.planId,
    kind: data.kind,
    startDate: data.startDate,
    weeksTotal: data.weeksTotal,
    weeks: data.weeks.create,
  });
}

const sessaoConcluida = (iso: string, sets: FakeSet[] = []): FakeSession => ({
  userId: 'user-A',
  startedAt: new Date(iso),
  completedAt: new Date(iso),
  sets,
});

const forca = (weightKg: number, rpe: number | null, exerciseId = 1): FakeSet => ({
  exerciseId,
  weightKg,
  reps: 8,
  rpe,
});

describe('TrainingBlockService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const congelaEm = (iso: string) => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(new Date(iso));
  };

  describe('create', () => {
    it('ancora o bloco na segunda-feira do fuso do USUÁRIO, não do UTC', async () => {
      // Segunda 22h em São Paulo já é terça 01h em UTC. Pelo relógio do servidor
      // hoje não seria segunda, o bloco começaria só na segunda seguinte e a pessoa
      // esperaria uma semana inteira pelo que montou agora.
      congelaEm('2026-01-20T01:00:00Z');
      const prisma = fakePrisma({ weeklyWorkouts: 4 });

      const criado = await makeService(prisma).create(CTX, {});

      expect(criado.startDate).toBe('2026-01-19');
      expect(criado.weeks.map((w) => w.weekStart)).toEqual([
        '2026-01-19',
        '2026-01-26',
        '2026-02-02',
        '2026-02-09',
      ]);
    });

    it('montado fora de segunda, começa na PRÓXIMA segunda e não nasce com uma semana perdida', async () => {
      // Domingo 15h em São Paulo. Ancorar na segunda desta semana daria à semana 1
      // uma janela que fecha no mesmo dia: na segunda seguinte ela já apareceria
      // perdida, "o bloco esperou" — por uma semana que terminou antes de o bloco
      // existir —, e essa falta fantasma consumiria uma das três que o encerram.
      congelaEm('2026-01-11T18:00:00Z');
      const prisma = fakePrisma({ weeklyWorkouts: 3 });

      const criado = await makeService(prisma).create(CTX, {});
      expect(criado.startDate).toBe('2026-01-12');

      // Mesmo bloco, lido na segunda seguinte: nenhuma sessão feita ainda, e mesmo
      // assim nada de perdido — a semana 1 está começando agora.
      congelaEm('2026-01-12T15:00:00Z');
      const emSeguida = fakePrisma({ blocks: [blocoCriado(prisma)], sessions: [] });

      const view = await makeService(emSeguida).getActive(CTX);

      expect(view?.currentWeek?.weekNumber).toBe(1);
      expect(view?.currentWeek?.shiftedWeeks).toBe(0);
      expect(view?.explanation).not.toContain('esperou');
    });

    it('avisa a data em que o bloco começa quando ele ainda não começou', async () => {
      congelaEm('2026-01-11T18:00:00Z');
      const prisma = fakePrisma({ weeklyWorkouts: 3 });

      const criado = await makeService(prisma).create(CTX, {});

      expect(criado.explanation).toContain('O bloco começa na segunda, 12/01.');
    });

    it('copia os fatores do template para as linhas e usa a meta semanal', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ weeklyWorkouts: 5 });

      await makeService(prisma).create(CTX, { kind: 'strength' });

      const data = prisma.trainingBlock.create.mock.calls[0][0].data;
      expect(data.weeks.create.map((w) => [w.focus, w.intensityFactor, w.volumeFactor])).toEqual(
        BLOCK_TEMPLATE.map((w) => [w.focus, w.intensityFactor, w.volumeFactor]),
      );
      expect(data.weeks.create.every((w) => w.sessionsTarget === 5)).toBe(true);
      expect(data.kind).toBe('strength');
    });

    it('devolve a faixa de repetições do tipo do bloco', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ weeklyWorkouts: 3 });

      const criado = await makeService(prisma).create(CTX, { kind: 'strength' });

      expect(criado.repRange).toBe('4-6');
    });

    it('não deixa apontar para o plano de outra pessoa', async () => {
      // O `planId` vem do corpo; ser dono da conta não autoriza escrever amarrado
      // ao plano alheio (#204). E a resposta é a mesma de "não existe" (#92).
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        plans: [{ id: 'plan-de-outro', userId: 'user-B', name: 'Push do B' }],
      });

      await expect(
        makeService(prisma).create(CTX, { planId: 'plan-de-outro' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.trainingBlock.create).not.toHaveBeenCalled();
    });

    it('recusa um segundo bloco enquanto o primeiro está de pé', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [sessaoConcluida('2026-01-06T12:00:00Z')],
      });

      await expect(makeService(prisma).create(CTX, {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('fecha o bloco que a reconciliação já deu por vencido e libera o próximo', async () => {
      // Sem isto, um bloco derivado-abandonado ficaria `active` no banco para
      // sempre e travaria a criação de qualquer outro.
      congelaEm('2026-02-04T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()], sessions: [] });

      const criado = await makeService(prisma).create(CTX, {});

      expect(prisma.trainingBlock.update).toHaveBeenCalledWith({
        where: { id: 'block-1' },
        data: { status: 'abandoned' },
      });
      expect(criado.id).toBe('block-novo');
    });
  });

  describe('getActive', () => {
    it('procura só bloco do próprio usuário', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco({ userId: 'user-B' })] });

      await expect(makeService(prisma).getActive(CTX)).resolves.toBeNull();
      expect(prisma.trainingBlock.findFirst.mock.calls[0][0].where).toMatchObject({
        userId: 'user-A',
        status: 'active',
      });
    });

    it('sessão em andamento não fecha a semana', async () => {
      // Mesma regra da prescrição (#144). A fixture tem a sessão em andamento
      // DENTRO da janela: quem filtra é o código, não o teste. Sem o recorte, a
      // semana 1 contaria 1 sessão, viraria parcial e o bloco andaria para a
      // semana 2 no meio do treino.
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          {
            userId: 'user-A',
            startedAt: new Date('2026-01-07T12:00:00Z'),
            completedAt: null,
            sets: [],
          },
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.currentWeek?.weekNumber).toBe(1);
      expect(view?.currentWeek?.sessionsDone).toBe(0);
      expect(view?.currentWeek?.shiftedWeeks).toBe(1);
    });

    it('conta a semana e avança quando as sessões foram concluídas', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          sessaoConcluida('2026-01-06T12:00:00Z'),
          sessaoConcluida('2026-01-08T12:00:00Z'),
          sessaoConcluida('2026-01-10T12:00:00Z'),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.currentWeek?.weekNumber).toBe(2);
      expect(view?.nextWeek?.weekNumber).toBe(3);
      expect(view?.weeks[0].sessionsDone).toBe(3);
    });

    it('conta a sessão pelo dia do usuário, não pelo dia UTC', async () => {
      // Sessão concluída sábado 22h em São Paulo é domingo 01h em UTC. Contar pelo
      // UTC ainda cairia na mesma semana; a que quebra é a de DOMINGO 22h local,
      // que em UTC vira segunda — e migraria para a semana seguinte.
      congelaEm('2026-01-20T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          sessaoConcluida('2026-01-12T01:00:00Z'),
          sessaoConcluida('2026-01-13T12:00:00Z'),
          sessaoConcluida('2026-01-14T12:00:00Z'),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      // 2026-01-12T01:00Z é 2026-01-11 (domingo) em São Paulo: semana 1, não 2.
      expect(view?.weeks[0].sessionsDone).toBe(1);
      expect(view?.weeks[1].sessionsDone).toBe(2);
    });

    it('some da tela quando o bloco já venceu por ausência', async () => {
      // Card fantasma pedindo o treino de um mês atrás é pior que card nenhum.
      congelaEm('2026-02-04T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()], sessions: [] });

      await expect(makeService(prisma).getActive(CTX)).resolves.toBeNull();
    });

    it('NÃO grava durante a leitura', async () => {
      // `get_training_block` declara `readOnlyHint: true`. Reconciliar gravando
      // faria a leitura mudar estado — o erro que o dashboard já pagou com
      // conquistas criadas por "quanto comi hoje?".
      congelaEm('2026-02-04T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()], sessions: [] });

      await makeService(prisma).getActive(CTX);

      expect(prisma.trainingBlock.update).not.toHaveBeenCalled();
      expect(prisma.trainingBlock.create).not.toHaveBeenCalled();
    });

    it('explica a espera quando o usuário perdeu a semana', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()], sessions: [] });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.explanation).toContain('o bloco esperou');
      expect(view?.currentWeek?.effectiveWeekStart).toBe('2026-01-12');
    });
  });

  describe('abandon', () => {
    it('não encerra o bloco de outra pessoa', async () => {
      // Sem RLS (ADR 010) esta guarda **é** o isolamento de
      // `DELETE /api/workout/blocks/:id` e da tool `delete_training_block`, que é
      // marcada como destrutiva — o Claude a chama sem confirmar. E a resposta é a
      // mesma de "não existe" (#92).
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco({ userId: 'user-B' })] });

      await expect(makeService(prisma).abandon(CTX, 'block-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.trainingBlock.update).not.toHaveBeenCalled();
    });

    it('encerra o bloco do próprio dono', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()] });

      await makeService(prisma).abandon(CTX, 'block-1');

      expect(prisma.trainingBlock.update).toHaveBeenCalledWith({
        where: { id: 'block-1' },
        data: { status: 'abandoned' },
      });
    });

    it('responde NotFound para bloco inexistente, sem gravar nada', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()] });

      await expect(makeService(prisma).abandon(CTX, 'block-que-nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.trainingBlock.update).not.toHaveBeenCalled();
    });
  });

  describe('deload por sinal real', () => {
    /** Bloco cuja semana corrente é a 2 (a semana 1 fechou com 3 sessões). */
    const semanaUmCheia = [
      sessaoConcluida('2026-01-06T12:00:00Z', [forca(60, 7)]),
      sessaoConcluida('2026-01-08T12:00:00Z', [forca(60, 8)]),
      sessaoConcluida('2026-01-10T12:00:00Z', [forca(60, 9)]),
    ];

    it('antecipa o deload quando o RPE sobe com a carga parada', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({ blocks: [bloco()], sessions: semanaUmCheia });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.currentWeek?.weekNumber).toBe(2);
      expect(view?.deload).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
      // A semana 2 passa a valer os fatores do deload, e a de acúmulo vai para o
      // fim: o bloco continua com 4 semanas, não ganha uma quinta.
      expect(view?.currentWeek?.focus).toBe('deload');
      expect(view?.currentWeek?.intensityFactor).toBe(0.85);
      expect(view?.weeks[3].focus).toBe('accumulation');
      expect(view?.weeks).toHaveLength(4);
    });

    it('não antecipa nada quando o RPE sobe junto com a carga', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          sessaoConcluida('2026-01-06T12:00:00Z', [forca(60, 7)]),
          sessaoConcluida('2026-01-08T12:00:00Z', [forca(62.5, 8)]),
          sessaoConcluida('2026-01-10T12:00:00Z', [forca(65, 9)]),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.deload).toEqual({ suggested: false, reason: 'load_rising' });
      expect(view?.currentWeek?.focus).toBe('accumulation');
    });

    it('mede o sinal só com sessões ANTERIORES à semana corrente', async () => {
      // Janela congelada: se as sessões da própria semana entrassem, a sugestão
      // piscaria a cada série registrada — e a semana mudaria de cara no meio do
      // treino. As três de RPE baixo abaixo são da semana 2 e não podem desligar
      // o sinal que veio da semana 1.
      congelaEm('2026-01-16T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          ...semanaUmCheia,
          sessaoConcluida('2026-01-13T12:00:00Z', [forca(60, 5)]),
          sessaoConcluida('2026-01-14T12:00:00Z', [forca(60, 5)]),
          sessaoConcluida('2026-01-15T12:00:00Z', [forca(60, 5)]),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.deload).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
    });

    it('não desliga o sinal quando a sessão mais recente está sem RPE', async () => {
      // `rpe` é opcional na série: a sessão sem o campo é o caso comum, não o
      // exótico. O helper foi escrito para PULAR essa sessão — mas ele só consegue
      // pular se a busca trouxer candidata sobrando. Buscando exatamente a janela,
      // uma única sessão sem RPE desligava em silêncio a feature-título da issue.
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [...semanaUmCheia, sessaoConcluida('2026-01-11T12:00:00Z', [forca(60, null)])],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.deload).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
      expect(view?.currentWeek?.focus).toBe('deload');
    });

    it('o deload antecipado continua na mesma semana na leitura seguinte', async () => {
      // A antecipação é derivada, e derivada instável reescreve o que o bloco já
      // prescreveu: a semana 2 saía como deload numa leitura e voltava a acúmulo na
      // outra (o próprio deload derruba o RPE que produziu o sinal), com a semana 4
      // voltando a ser deload — dois deloads em quatro semanas.
      congelaEm('2026-01-21T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco()],
        sessions: [
          ...semanaUmCheia,
          // Semana 2 já feita em regime de deload: carga e RPE lá embaixo.
          sessaoConcluida('2026-01-13T12:00:00Z', [forca(50, 5)]),
          sessaoConcluida('2026-01-15T12:00:00Z', [forca(50, 5)]),
          sessaoConcluida('2026-01-17T12:00:00Z', [forca(50, 5)]),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.currentWeek?.weekNumber).toBe(3);
      expect(view?.weeks[1].focus).toBe('deload');
      expect(view?.weeks[1].intensityFactor).toBe(0.85);
      expect(view?.weeks[3].focus).toBe('accumulation');
      // A frase do deload é da semana que ficou com ele, não da semana corrente.
      expect(view?.explanation).not.toContain('O deload veio para cá');
    });

    it('restringe o sinal aos exercícios do plano do bloco', async () => {
      congelaEm('2026-01-14T15:00:00Z');
      const prisma = fakePrisma({
        blocks: [bloco({ planId: 'plan-1', plan: { name: 'Push' } })],
        planExerciseIds: [1],
        sessions: [
          ...semanaUmCheia,
          // Exercício fora do plano, com RPE que derrubaria o sinal se entrasse.
          sessaoConcluida('2026-01-09T12:00:00Z', [forca(20, 3, 99)]),
        ],
      });

      const view = await makeService(prisma).getActive(CTX);

      expect(view?.deload).toEqual({ suggested: true, rpeDelta: 2, loadDeltaKg: 0 });
    });
  });
});

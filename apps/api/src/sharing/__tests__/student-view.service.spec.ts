import { NotFoundException } from '@nestjs/common';
import { ShareScope } from '@fatia/db';
import { StudentViewService } from '../student-view.service';
import type { ProfessionalAccessService } from '../professional-access.service';
import type { PrismaService } from '../../common/prisma.service';
import type { GoalsService } from '../../goals/goals.service';
import type { NutritionSummaryService } from '../../nutrition/nutrition-summary.service';
import type { ProgressService } from '../../progress/progress.service';
import type { WorkoutPlanService } from '../../workout/workout-plan.service';
import type { WorkoutSessionService } from '../../workout/workout-session.service';

const PRO = 'pro-1';
const SUBJECT = 'aluno-1';
const MEMBERSHIP = 'membership-1';
const TZ_ALUNO = 'America/Sao_Paulo';
/** Deliberadamente do outro lado do mundo: erro de fuso tem de saltar aos olhos. */
const TZ_PROFISSIONAL = 'Pacific/Kiritimati';

/**
 * O que `user-isolation.spec.ts` **não** cobre, e por isso este arquivo existe:
 * lá o alvo é o isolamento contra Postgres real, e o caminho feliz é exercitado
 * em três escopos. Aqui o alvo é o despacho — que a categoria conferida seja
 * sempre a categoria lida, nos **cinco** escopos, e que nenhum service de
 * domínio seja chamado com o `userId` de quem está lendo.
 *
 * É a diferença entre "não vazou" e "leu a coisa certa": um `switch` que
 * conferisse `WORKOUT` e devolvesse nutrição passaria em todo caso de
 * isolamento, porque o vazamento aconteceria dentro de um vínculo legítimo.
 */
describe('StudentViewService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    groupMembership: { findMany: jest.Mock };
    professionalLink: { findMany: jest.Mock };
  };
  let access: { assertReadable: jest.Mock };
  let plans: { list: jest.Mock };
  let sessions: { list: jest.Mock };
  let progress: {
    volumeProgress: jest.Mock;
    weightProgress: jest.Mock;
    stepsProgress: jest.Mock;
    waterProgress: jest.Mock;
  };
  let nutrition: { getHistory: jest.Mock };
  let goals: { list: jest.Mock };
  let service: StudentViewService;

  beforeEach(() => {
    prisma = {
      user: {
        // Despacho pelo `where`, e não um valor fixo: um mock que devolvesse o
        // mesmo fuso para qualquer id deixaria passar justamente o defeito que
        // o caso do fuso existe para pegar — buscar o fuso de quem está LENDO.
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(
            args.where.id === SUBJECT ? { timezone: TZ_ALUNO } : { timezone: TZ_PROFISSIONAL },
          ),
        ),
      },
      groupMembership: { findMany: jest.fn() },
      professionalLink: { findMany: jest.fn() },
    };
    access = { assertReadable: jest.fn().mockResolvedValue(SUBJECT) };
    plans = { list: jest.fn().mockResolvedValue([]) };
    sessions = { list: jest.fn().mockResolvedValue([]) };
    progress = {
      volumeProgress: jest.fn().mockResolvedValue({}),
      weightProgress: jest.fn().mockResolvedValue({}),
      stepsProgress: jest.fn().mockResolvedValue({}),
      waterProgress: jest.fn().mockResolvedValue({}),
    };
    nutrition = { getHistory: jest.fn().mockResolvedValue({}) };
    goals = { list: jest.fn().mockResolvedValue([]) };

    service = new StudentViewService(
      prisma as unknown as PrismaService,
      access as unknown as ProfessionalAccessService,
      plans as unknown as WorkoutPlanService,
      sessions as unknown as WorkoutSessionService,
      progress as unknown as ProgressService,
      nutrition as unknown as NutritionSummaryService,
      goals as unknown as GoalsService,
    );
  });

  describe('read', () => {
    it.each(Object.values(ShareScope))(
      'confere exatamente %s antes de ler %s, uma vez só',
      async (scope) => {
        await service.read(PRO, MEMBERSHIP, scope, 30);

        expect(access.assertReadable).toHaveBeenCalledTimes(1);
        // A asserção é sobre a chamada inteira, e não só sobre o escopo: trocar
        // o `professionalId` pelo `subjectUserId` por descuido faria a porta
        // conferir a pessoa errada e continuaria batendo num `toHaveBeenCalledWith`
        // parcial.
        expect(access.assertReadable).toHaveBeenCalledWith(
          PRO,
          MEMBERSHIP,
          scope,
          'get_student_progress',
        );
      },
    );

    /** Qual mock precisa ter sido chamado, e quais não podem ter sido. */
    const esperado: Record<ShareScope, string[]> = {
      [ShareScope.WORKOUT]: ['plans.list', 'sessions.list', 'progress.volumeProgress'],
      [ShareScope.NUTRITION]: ['nutrition.getHistory'],
      [ShareScope.BODY]: ['progress.weightProgress'],
      [ShareScope.HABITS]: ['progress.stepsProgress', 'progress.waterProgress'],
      [ShareScope.GOALS]: ['goals.list'],
    };

    it.each(Object.values(ShareScope))('lê só o que %s cobre', async (scope) => {
      await service.read(PRO, MEMBERSHIP, scope, 30);

      const todos: Record<string, jest.Mock> = {
        'plans.list': plans.list,
        'sessions.list': sessions.list,
        'progress.volumeProgress': progress.volumeProgress,
        'progress.weightProgress': progress.weightProgress,
        'progress.stepsProgress': progress.stepsProgress,
        'progress.waterProgress': progress.waterProgress,
        'nutrition.getHistory': nutrition.getHistory,
        'goals.list': goals.list,
      };

      // A lista inteira de uma vez, e não um `expect` por mock: a falha diz qual
      // service sobrou e qual faltou, em vez de parar no primeiro.
      const chamados = Object.entries(todos)
        .filter(([, mock]) => mock.mock.calls.length > 0)
        .map(([nome]) => nome)
        .sort();

      expect(chamados).toEqual([...esperado[scope]].sort());
    });

    it('chama os services de domínio com o userId do ALUNO, e no fuso dele', async () => {
      // O defeito que este caso pega é o mais provável de todos: usar o `userId`
      // de quem está lendo depois de a porta ter autorizado. Ele não vaza nada —
      // devolve o dado do PRÓPRIO profissional com aparência de painel — e por
      // isso não aparece em nenhum teste de isolamento.
      await service.read(PRO, MEMBERSHIP, ShareScope.BODY, 45);

      expect(progress.weightProgress).toHaveBeenCalledWith(45, {
        userId: SUBJECT,
        timezone: TZ_ALUNO,
      });
    });

    it('recusa se a conta do aluno sumiu entre a conferência e a leitura', async () => {
      prisma.user.findUnique.mockImplementation(() => Promise.resolve(null));

      await expect(service.read(PRO, MEMBERSHIP, ShareScope.BODY, 30)).rejects.toThrow(
        NotFoundException,
      );
      // Nenhuma leitura de domínio pode ter acontecido com fuso inventado.
      expect(progress.weightProgress).not.toHaveBeenCalled();
    });

    it('não devolve o userId do aluno, nem em objeto aninhado', async () => {
      // A poda é recursiva de propósito: o `userId` viaja dentro do plano, dentro
      // do exercício aninhado no plano, e dentro de cada item de array.
      plans.list.mockResolvedValue([
        {
          id: 'plano-1',
          userId: SUBJECT,
          name: 'A',
          exercises: [{ id: 'pe-1', exercise: { id: 3, userId: SUBJECT, name: 'Supino' } }],
        },
      ]);

      const resultado = await service.read(PRO, MEMBERSHIP, ShareScope.WORKOUT, 30);

      expect(JSON.stringify(resultado)).not.toContain(SUBJECT);
      // E o resto do payload continua inteiro — uma poda que apagasse o objeto
      // todo também passaria na asserção acima.
      if (resultado.reading.scope !== ShareScope.WORKOUT) throw new Error('escopo errado');
      expect(resultado.reading.plans[0].exercises[0].exercise.name).toBe('Supino');
    });
  });

  describe('listStudents', () => {
    it('não consulta aluno nenhum quando não sou PROFESSIONAL em lugar algum', async () => {
      prisma.groupMembership.findMany.mockResolvedValue([]);

      await expect(service.listStudents(PRO)).resolves.toEqual([]);
      // Só a busca dos próprios grupos aconteceu: sem grupo, um segundo
      // `findMany` com `groupId: { in: [] }` seria consulta inútil — e, num
      // refactor que trocasse o `in` por um filtro opcional, viraria "todos".
      expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.professionalLink.findMany).not.toHaveBeenCalled();
    });

    it('casa o consentimento por (grupo, titular), e não só pelo titular', async () => {
      // A mesma pessoa é aluna de duas academias do mesmo profissional e
      // consentiu coisas diferentes em cada uma. Chavear só pelo titular faria o
      // consentimento de uma academia aparecer na outra — e o painel diria que
      // pode ler o que não pode.
      prisma.groupMembership.findMany
        .mockResolvedValueOnce([
          { groupId: 'g1', group: { name: 'Academia 1' } },
          { groupId: 'g2', group: { name: 'Academia 2' } },
        ])
        .mockResolvedValueOnce([
          {
            id: 'm1',
            groupId: 'g1',
            userId: SUBJECT,
            joinedAt: null,
            user: { name: 'Ana' },
          },
          {
            id: 'm2',
            groupId: 'g2',
            userId: SUBJECT,
            joinedAt: null,
            user: { name: 'Ana' },
          },
        ]);
      prisma.professionalLink.findMany.mockResolvedValue([
        { groupId: 'g1', subjectUserId: SUBJECT, scopes: [ShareScope.WORKOUT] },
      ]);

      const alunos = await service.listStudents(PRO);

      expect(alunos.map((a) => [a.membershipId, a.scopesGrantedToMe])).toEqual([
        ['m1', [ShareScope.WORKOUT]],
        ['m2', []],
      ]);
    });
  });
});

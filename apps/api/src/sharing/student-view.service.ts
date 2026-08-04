import { Injectable, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { ProfessionalAccessService } from './professional-access.service';
import { GoalsService } from '../goals/goals.service';
import { NutritionSummaryService } from '../nutrition/nutrition-summary.service';
import { ProgressService } from '../progress/progress.service';
import { WorkoutPlanService } from '../workout/workout-plan.service';
import { WorkoutSessionService } from '../workout/workout-session.service';

/** Mesma resposta da porta de leitura. Nunca uma mensagem própria (#92). */
const NOT_FOUND = 'Membership not found';

/**
 * Nome da operação na trilha de auditoria. Um só, e igual ao nome da tool: é o
 * que o aluno lê em `list_data_access_log`, e "get_student_progress" diz a ele
 * o que aconteceu. O escopo já é coluna própria da trilha, então repeti-lo aqui
 * daria duas fontes para a mesma informação.
 */
const ACTION = 'get_student_progress';

/** Últimas sessões trazidas na leitura de treino. Painel, não exportação. */
const SESSOES_NO_PAINEL = 20;

/**
 * Chaves que carregam identidade de usuário e por isso não saem de uma leitura
 * delegada.
 *
 * A regra do produto é que identidade não entra **nem sai** por input/output —
 * o painel referencia o aluno pela associação (`membershipId`), nunca pelo
 * `userId`. Sem esta poda o `userId` do aluno viajaria de brinde dentro de todo
 * `WorkoutPlan` e todo `Goal` lidos, e daria ao profissional a chave para
 * correlacionar a mesma pessoa entre duas academias — informação que nem o
 * consentimento dela cobre.
 */
const CHAVES_DE_IDENTIDADE = ['userId', 'subjectUserId', 'professionalId', 'logtoSub'] as const;

type ChaveDeIdentidade = (typeof CHAVES_DE_IDENTIDADE)[number];

/**
 * O tipo do valor depois da poda. Existe para que a remoção seja **estrutural**:
 * um branch novo em `read()` não tem como devolver `userId` sem erro de tipo, e
 * ninguém precisa lembrar de omitir o campo em cada projeção.
 */
export type SemIdentidade<T> = T extends Date
  ? T
  : T extends ReadonlyArray<infer U>
    ? Array<SemIdentidade<U>>
    : T extends object
      ? { [K in keyof T as K extends ChaveDeIdentidade ? never : K]: SemIdentidade<T[K]> }
      : T;

function podar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(podar);
  // `null` é `object` para o `typeof`, e `Date` é objeto que não se desmonta.
  if (valor === null || typeof valor !== 'object' || valor instanceof Date) return valor;

  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([chave]) => !(CHAVES_DE_IDENTIDADE as readonly string[]).includes(chave))
      .map(([chave, dentro]) => [chave, podar(dentro)]),
  );
}

function semIdentidade<T>(valor: T): SemIdentidade<T> {
  return podar(valor) as SemIdentidade<T>;
}

/** Um aluno na lista do profissional. Metadado de associação, nunca dado de saúde. */
export interface StudentView {
  membershipId: string;
  name: string;
  groupId: string;
  groupName: string;
  joinedAt: Date | null;
  /**
   * O que ESTE aluno consentiu a ESTE profissional. `[]` é o normal de quem
   * ainda não consentiu nada — e é o que a tela usa para mostrar "aguardando
   * autorização" em vez de um botão que só daria `NOT_FOUND`.
   */
  scopesGrantedToMe: ShareScope[];
}

type Sem<T> = SemIdentidade<Awaited<T>>;

/**
 * O conteúdo de UMA leitura. União discriminada pelo escopo: não existe forma de
 * devolver treino tendo conferido nutrição, porque o campo nem existe no outro
 * branch.
 */
export type StudentReading =
  | {
      scope: typeof ShareScope.WORKOUT;
      plans: Sem<ReturnType<WorkoutPlanService['list']>>;
      sessions: Sem<ReturnType<WorkoutSessionService['list']>>;
      volume: Sem<ReturnType<ProgressService['volumeProgress']>>;
    }
  | {
      scope: typeof ShareScope.NUTRITION;
      history: Sem<ReturnType<NutritionSummaryService['getHistory']>>;
    }
  | { scope: typeof ShareScope.BODY; weight: Sem<ReturnType<ProgressService['weightProgress']>> }
  | {
      scope: typeof ShareScope.HABITS;
      steps: Sem<ReturnType<ProgressService['stepsProgress']>>;
      water: Sem<ReturnType<ProgressService['waterProgress']>>;
    }
  | { scope: typeof ShareScope.GOALS; goals: Sem<ReturnType<GoalsService['list']>> };

export interface StudentReadResult {
  /** Ecoa o que foi pedido. O `userId` do aluno não sai daqui. */
  membershipId: string;
  /**
   * Fuso do **aluno**. Toda janela de dia abaixo foi cortada nele, e não no do
   * profissional: um personal em Lisboa lendo aluna em São Paulo veria o dia
   * começar oito horas antes do que ela viveu, e a "segunda-feira sem treino"
   * seria um artefato de fuso. Vai na resposta para que a tela rotule as datas
   * com o mesmo fuso em que elas foram cortadas.
   */
  timezone: string;
  reading: StudentReading;
}

/**
 * Painel do profissional — o lado **leitura** da ADR 014 (#157).
 *
 * Este arquivo não tem query de dado de saúde. Ele faz três coisas, nesta
 * ordem, e nada mais:
 *
 * 1. chama `ProfessionalAccessService.assertReadable`, a porta única, com **um**
 *    escopo;
 * 2. recebe de volta o `userId` do titular;
 * 3. chama o service de domínio **intocado** com esse `userId`, exatamente como
 *    o dono chamaria.
 *
 * É por isso que `workout-plan.service.ts`, `progress.service.ts` e companhia
 * saem desta issue sem uma linha alterada: nenhum deles sabe que grupo existe.
 *
 * **Uma chamada de `assertReadable` por escopo lido, sempre.** Guardar o
 * `subjectUserId` e servir várias categorias com uma conferência só faria o
 * consentimento por categoria virar decoração — e a trilha de auditoria, que
 * grava uma linha por chamada, passaria a mentir por omissão. Por isso `read()`
 * recebe **um** `ShareScope` e o resolve num `switch` fechado: não há caminho em
 * que o escopo conferido seja diferente do escopo lido.
 *
 * **O que o profissional NÃO faz aqui:** escrever. Nada neste arquivo muda dado
 * de aluno. A direção profissional → aluno é oferta + aceite, e o aceite roda
 * sob o `userId` do próprio aluno (ver a proposta de `ProfessionalOffer` no
 * corpo da PR desta issue).
 */
@Injectable()
export class StudentViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProfessionalAccessService,
    private readonly plans: WorkoutPlanService,
    private readonly sessions: WorkoutSessionService,
    private readonly progress: ProgressService,
    private readonly nutrition: NutritionSummaryService,
    private readonly goals: GoalsService,
  ) {}

  /**
   * Os alunos que este profissional atende, em todos os grupos em que ele é
   * `PROFESSIONAL` ativo, com o que cada um consentiu **a ele**.
   *
   * Não passa pela porta de leitura, e não é esquecimento: aqui não há dado de
   * saúde nenhum — é composição de grupo, a mesma informação que
   * `member.list` já devolve pela matriz de papéis (#156). Fazer esta lista
   * exigir consentimento esconderia do profissional justamente o aluno que ele
   * precisa encontrar para **pedir** o consentimento.
   *
   * Só `MEMBER` entra: dono, criador de conteúdo e os outros profissionais da
   * academia são colegas, não alunos, e não têm por que aparecer numa lista de
   * atendimento.
   */
  async listStudents(professionalId: string): Promise<StudentView[]> {
    const minhas = await this.prisma.groupMembership.findMany({
      where: {
        userId: professionalId,
        role: GroupRole.PROFESSIONAL,
        // Sem `ACTIVE` aqui o ex-funcionário continuaria com a lista de alunos
        // da academia que o demitiu — nome por nome, mesmo sem ler dado nenhum.
        status: MembershipStatus.ACTIVE,
      },
      select: { groupId: true, group: { select: { name: true } } },
    });
    if (minhas.length === 0) return [];

    const groupIds = minhas.map((m) => m.groupId);
    const nomeDoGrupo = new Map(minhas.map((m) => [m.groupId, m.group.name]));

    const [alunos, vinculos] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: {
          groupId: { in: groupIds },
          role: GroupRole.MEMBER,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
          groupId: true,
          userId: true,
          joinedAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ groupId: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.professionalLink.findMany({
        where: { professionalId, groupId: { in: groupIds }, revokedAt: null },
        select: { groupId: true, subjectUserId: true, scopes: true },
      }),
    ]);

    // Chaveado por (grupo, titular), e não só pelo titular: a mesma pessoa pode
    // ser aluna de duas academias do mesmo profissional e ter consentido
    // coisas diferentes em cada uma. Chavear só pelo titular faria o
    // consentimento de uma academia aparecer na outra.
    const porGrupoETitular = new Map(
      vinculos.map((v) => [`${v.groupId}:${v.subjectUserId}`, v.scopes]),
    );

    return alunos.map((aluno) => ({
      membershipId: aluno.id,
      name: aluno.user.name,
      groupId: aluno.groupId,
      groupName: nomeDoGrupo.get(aluno.groupId) ?? '',
      joinedAt: aluno.joinedAt,
      scopesGrantedToMe: porGrupoETitular.get(`${aluno.groupId}:${aluno.userId}`) ?? [],
    }));
  }

  /**
   * Uma leitura, de um escopo, de um aluno.
   *
   * @param professionalId sempre do contexto autenticado, nunca do corpo
   * @param membershipId   associação do aluno; o `userId` dele sai da porta
   * @param scope          o escopo lido — e o mesmo que será conferido
   * @param days           janela em dias das séries temporais
   *
   * @throws NotFoundException idêntico ao de um estranho, quando não há vínculo,
   *         o vínculo foi revogado, o escopo não foi consentido, ou qualquer
   *         das duas pontas saiu do grupo
   */
  async read(
    professionalId: string,
    membershipId: string,
    scope: ShareScope,
    days: number,
  ): Promise<StudentReadResult> {
    const subjectUserId = await this.access.assertReadable(
      professionalId,
      membershipId,
      scope,
      ACTION,
    );

    const titular = await this.prisma.user.findUnique({
      where: { id: subjectUserId },
      select: { timezone: true },
    });
    // A conta pode ter sido apagada entre a conferência e a leitura. Mesma
    // recusa de sempre — inventar um fuso padrão aqui cortaria os dias de outra
    // pessoa no fuso errado e ninguém veria o erro.
    if (!titular) throw new NotFoundException(NOT_FOUND);

    const ctx = { userId: subjectUserId, timezone: titular.timezone };

    return { membershipId, timezone: ctx.timezone, reading: await this.ler(scope, ctx, days) };
  }

  /**
   * O `switch` é exaustivo por tipo: `ShareScope` ganhar um valor quebra a
   * compilação aqui, e não devolve uma leitura vazia em silêncio depois de a
   * porta já ter autorizado.
   */
  private async ler(
    scope: ShareScope,
    ctx: { userId: string; timezone: string },
    days: number,
  ): Promise<StudentReading> {
    switch (scope) {
      case ShareScope.WORKOUT: {
        const [plans, sessions, volume] = await Promise.all([
          this.plans.list(ctx.userId),
          this.sessions.list(ctx.userId, { limit: SESSOES_NO_PAINEL }),
          this.progress.volumeProgress(days, undefined, ctx),
        ]);
        return {
          scope: ShareScope.WORKOUT,
          plans: semIdentidade(plans),
          sessions: semIdentidade(sessions),
          volume: semIdentidade(volume),
        };
      }
      case ShareScope.NUTRITION:
        return {
          scope: ShareScope.NUTRITION,
          history: semIdentidade(await this.nutrition.getHistory(ctx.userId, days, ctx.timezone)),
        };
      case ShareScope.BODY:
        return {
          scope: ShareScope.BODY,
          weight: semIdentidade(await this.progress.weightProgress(days, ctx)),
        };
      case ShareScope.HABITS: {
        const [steps, water] = await Promise.all([
          this.progress.stepsProgress(days, ctx),
          this.progress.waterProgress(days, ctx),
        ]);
        return {
          scope: ShareScope.HABITS,
          steps: semIdentidade(steps),
          water: semIdentidade(water),
        };
      }
      case ShareScope.GOALS:
        return {
          scope: ShareScope.GOALS,
          goals: semIdentidade(await this.goals.list({}, ctx.userId, ctx.timezone)),
        };
    }
  }
}

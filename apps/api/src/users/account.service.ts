import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LogtoManagementService } from '../auth/logto-management.service';

/** Frase exata que o usuário precisa confirmar para apagar a conta. */
export const DELETE_CONFIRMATION = 'DELETAR MINHA CONTA';

/**
 * Export e deleção de conta — direitos de portabilidade e eliminação da LGPD
 * (issue #95). Também expostos como tools MCP, então o usuário exerce os dois
 * direitos conversando com o Claude, sem abrir terminal nem formulário.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logtoManagement: LogtoManagementService,
  ) {}

  /**
   * Todos os dados do usuário em JSON. Inclui o catálogo custom que ele criou
   * (alimentos e exercícios), porque é conteúdo autoral dele — mas não o catálogo
   * público TACO, que não é dado pessoal e tornaria o export inútil de tamanho.
   */
  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        timezone: true,
        heightCm: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [
      nutritionGoals,
      nutrientTargets,
      personalGoals,
      meals,
      customFoods,
      customExercises,
      workoutPlans,
      workoutSessions,
      weightLogs,
      stepLogs,
      waterLogs,
      achievements,
      trainingBlocks,
      professionalLinks,
      accessLogs,
      conversations,
    ] = await Promise.all([
      this.prisma.userGoals.findUnique({ where: { userId } }),
      this.prisma.nutrientTarget.findMany({ where: { userId }, orderBy: { label: 'asc' } }),
      this.prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.meal.findMany({
        where: { userId },
        include: { items: true },
        orderBy: { eatenAt: 'asc' },
      }),
      this.prisma.food.findMany({
        where: { createdByUserId: userId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.exercise.findMany({
        where: { createdByUserId: userId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.workoutPlan.findMany({
        where: { userId },
        include: { exercises: { include: { exercise: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.workoutSession.findMany({
        where: { userId },
        include: { sets: { include: { exercise: { select: { id: true, name: true } } } } },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.weightLog.findMany({ where: { userId }, orderBy: { loggedAt: 'asc' } }),
      this.prisma.stepLog.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      this.prisma.waterLog.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
      // O `context` do desbloqueio (exercício e carga do primeiro recorde, por exemplo) é dado
      // de saúde e não existe em nenhuma outra tabela — sem esta consulta a portabilidade
      // devolveria menos do que "tudo".
      this.prisma.userAchievement.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'asc' },
      }),
      // O bloco de periodização é plano que o titular aceitou, com os multiplicadores
      // congelados naquele dia (ADR 019). Não dá para reconstruí-lo a partir das sessões:
      // sem as semanas junto, o export devolveria o treino feito sem o treino combinado.
      this.prisma.trainingBlock.findMany({
        where: { userId },
        include: { weeks: { orderBy: { weekNumber: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      // B2B (#155): consentimento que o titular concedeu, e a trilha de quem leu
      // o dado dele. Os dois são dado do titular — o primeiro é um ato dele, o
      // segundo é o que responde "quem olhou meu dado" —, e a LGPD art. 18 V
      // cobra os dois no export. Ficaram de fora na #153 com o argumento de que
      // seriam consultados na tela de compartilhamento; a tela existe agora, e
      // "está na tela" nunca foi resposta para portabilidade.
      //
      // O que NÃO entra: `linksAsProfessional`. Ali o titular é o profissional,
      // e a lista é de PACIENTES dele — dado de terceiro, e exportá-lo entregaria
      // a composição da clientela a quem pedisse o próprio arquivo.
      this.prisma.professionalLink.findMany({
        where: { subjectUserId: userId },
        select: {
          id: true,
          groupId: true,
          group: { select: { name: true } },
          // Nome, e não o `userId` do profissional: o export é do titular, e um
          // identificador interno de outra pessoa não acrescenta nada a ele.
          professional: { select: { name: true } },
          scopes: true,
          grantedAt: true,
          revokedAt: true,
          revokedReason: true,
        },
        orderBy: { grantedAt: 'asc' },
      }),
      this.prisma.professionalAccessLog.findMany({
        where: { subjectUserId: userId },
        select: { at: true, action: true, scope: true, denied: true, professionalId: true },
        orderBy: { at: 'asc' },
      }),
      // Chat com a IA hospedada (#249). É o dado mais íntimo do produto: as
      // outras tabelas guardam número, esta guarda o que a pessoa escreveu sobre
      // a própria saúde, em prosa. Deixá-la fora seria devolver menos do que
      // "tudo" no lugar em que "tudo" mais importa.
      //
      // O que NÃO entra junto é `AiUsage`: ali não há nada do titular — modelo e
      // custo do que a instância pagou —, e a linha inclusive sobrevive à
      // exclusão da conta de propósito (ver o `onDelete: SetNull` no schema).
      this.prisma.conversation.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          messages: {
            select: { role: true, content: true, tools: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // `ProfessionalAccessLog.professionalId` é string pura, sem FK — é o que faz
    // a trilha do titular sobreviver ao profissional apagar a conta. O preço é
    // resolver o nome à parte e aceitar que ele pode não existir mais.
    const idsDeProfissional = [...new Set(accessLogs.map((l) => l.professionalId))];
    const nomesDeProfissional = new Map(
      idsDeProfissional.length === 0
        ? []
        : (
            await this.prisma.user.findMany({
              where: { id: { in: idsDeProfissional } },
              select: { id: true, name: true },
            })
          ).map((u) => [u.id, u.name] as const),
    );

    return {
      // `exportedAt` é gerado no servidor de propósito: o cliente não deve poder
      // datar o próprio export.
      exportedAt: new Date().toISOString(),
      format: 'fatia-export-v1',
      user,
      nutritionGoals,
      nutrientTargets,
      personalGoals,
      meals,
      customFoods,
      customExercises,
      workoutPlans,
      workoutSessions,
      weightLogs,
      stepLogs,
      waterLogs,
      achievements,
      trainingBlocks,
      professionalLinks,
      conversations,
      accessLogs: accessLogs.map(({ professionalId, ...linha }) => ({
        ...linha,
        professionalName: nomesDeProfissional.get(professionalId) ?? null,
      })),
      counts: {
        achievements: achievements.length,
        conversations: conversations.length,
        professionalLinks: professionalLinks.length,
        accessLogs: accessLogs.length,
        meals: meals.length,
        customFoods: customFoods.length,
        customExercises: customExercises.length,
        workoutPlans: workoutPlans.length,
        workoutSessions: workoutSessions.length,
        weightLogs: weightLogs.length,
        stepLogs: stepLogs.length,
        waterLogs: waterLogs.length,
        personalGoals: personalGoals.length,
        nutrientTargets: nutrientTargets.length,
      },
    };
  }

  /**
   * Apaga a conta e todos os dados. Exige confirmação textual explícita porque a
   * operação é irreversível e o chamador pode ser um LLM interpretando uma frase
   * ambígua do usuário — a confirmação força a intenção a ser inequívoca.
   *
   * A deleção no Postgres é garantida pelos `onDelete: Cascade` a partir de
   * `User`. A identidade no Logto é apagada em seguida, num passo separado que
   * pode falhar sem desfazer o cascade — ver o comentário abaixo.
   */
  async deleteAccount(userId: string, confirmation: string) {
    if (confirmation !== DELETE_CONFIRMATION) {
      throw new BadRequestException(
        `Confirmação inválida. Para apagar a conta, envie confirmation exatamente como "${DELETE_CONFIRMATION}". ` +
          'Confirme com o usuário antes de repetir — a operação é irreversível.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, logtoSub: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Ordem deliberada: Logto primeiro. Se apagássemos o User local antes e o
    // Logto falhasse, a identidade órfã voltaria a provisionar um User novo no
    // próximo login — o usuário "renasceria" vazio em vez de ver um erro. Falhar
    // aqui deixa tudo intacto e retornável.
    const logtoDeleted = await this.logtoManagement.deleteUser(user.logtoSub);

    await this.prisma.user.delete({ where: { id: userId } });

    this.logger.log({
      event: 'account_deleted',
      userId,
      logtoDeleted,
      // Sem e-mail nem nome: o log não deve sobreviver ao dado que foi apagado.
    });

    return {
      deleted: true as const,
      logtoIdentityDeleted: logtoDeleted,
      message: logtoDeleted
        ? 'Conta e todos os dados apagados. A identidade de login também foi removida.'
        : 'Conta e todos os dados apagados. A identidade de login não pôde ser removida automaticamente — ' +
          'ela não dá mais acesso a nenhum dado, mas peça ao suporte para removê-la se quiser.',
    };
  }
}

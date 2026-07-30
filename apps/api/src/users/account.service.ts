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
    ]);

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
      counts: {
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

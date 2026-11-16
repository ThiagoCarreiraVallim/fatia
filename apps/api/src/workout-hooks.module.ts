import { Global, Module } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { CommonModule } from './common/common.module';
import { AchievementService } from './progress/achievement.service';
import { ProgressModule } from './progress/progress.module';
import { WORKOUT_FINISHED_HOOKS, type WorkoutFinishedHook } from './workout/workout-finished.hook';

/**
 * Os ganchos do fim do treino, como provider global — para o `WorkoutModule` recebê-los sem
 * importar o `ProgressModule` (que já importa o `WorkoutModule`).
 */
@Global()
@Module({
  imports: [CommonModule, ProgressModule],
  providers: [
    {
      provide: WORKOUT_FINISHED_HOOKS,
      useFactory: (
        prisma: PrismaService,
        achievements: AchievementService,
      ): WorkoutFinishedHook[] => [
        {
          // A avaliação pede o fuso (a semana completa é a semana local): o do perfil.
          afterFinish: async (userId) => {
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { timezone: true },
            });
            return achievements.evaluate({ userId, timezone: user?.timezone ?? 'UTC' });
          },
        },
      ],
      inject: [PrismaService, AchievementService],
    },
  ],
  exports: [WORKOUT_FINISHED_HOOKS],
})
export class WorkoutHooksModule {}

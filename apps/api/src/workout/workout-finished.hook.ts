import type { Logger } from '@nestjs/common';

/**
 * O que outros módulos fazem logo depois de um treino ser concluído (#382): hoje, reavaliar as
 * conquistas — o 100º treino desbloqueia "100 treinos" na hora, sem esperar a próxima abertura
 * do app.
 *
 * O gancho é declarado aqui, do lado do treino, e fornecido pelo `WorkoutHooksModule` como
 * provider global: o `ProgressModule` já importa o `WorkoutModule`, e o caminho inverso fecharia
 * um ciclo. Mesmo desenho dos ganchos de exclusão de conta.
 *
 * Um gancho que falha **não** desfaz o treino: o treino já foi gravado, e a conquista volta a
 * ser avaliada na próxima abertura (`POST /achievements/evaluate`).
 */
export const WORKOUT_FINISHED_HOOKS = Symbol('WORKOUT_FINISHED_HOOKS');

export interface WorkoutFinishedHook {
  afterFinish(userId: string): Promise<unknown>;
}

/**
 * Roda os ganchos depois que o fim do treino já foi gravado (fora da transação). O fim normal
 * (`WorkoutSessionService.finish`) e o do circuito (`CircuitSessionService`, #380) passam por
 * aqui. Um gancho que falha vira aviso no log: o treino segue concluído.
 */
export async function runWorkoutFinishedHooks(
  hooks: readonly WorkoutFinishedHook[] | undefined,
  userId: string,
  logger: Pick<Logger, 'warn'>,
): Promise<void> {
  for (const hook of hooks ?? []) {
    try {
      await hook.afterFinish(userId);
    } catch (err) {
      logger.warn(`gancho do fim do treino falhou: ${(err as Error).message}`);
    }
  }
}

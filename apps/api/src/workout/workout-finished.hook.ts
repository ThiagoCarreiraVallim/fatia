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

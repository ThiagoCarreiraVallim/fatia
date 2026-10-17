import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { NutrientTargetService } from '../../../nutrition/nutrient-target.service';
import { UserGoalsService } from '../../../nutrition/user-goals.service';
import { IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** O que o `set_nutrition_goals` exige inteiro. */
const OBRIGATORIAS = [
  'kcalMin',
  'kcalMax',
  'proteinMinG',
  'proteinMaxG',
  'carbsMinG',
  'carbsMaxG',
  'fatMinG',
  'fatMaxG',
] as const;
const OPCIONAIS = ['weeklyWorkouts', 'dailyStepsTarget', 'dailyWaterTargetMl'] as const;

/**
 * Atualização parcial: lê as metas (`get_nutrition_goals`), põe por cima só o que veio e
 * grava as oito com `set_nutrition_goals` — que troca todas. Mudar só a proteína sem ler
 * antes inventaria as outras sete; é a armadilha que a tarefa `nutri-mudar-meta` mede no
 * braço A. O limite de nutriente é o `set_nutrient_target`.
 */
@Injectable()
@McpTool()
export class UpdateMyTargetsTool extends IntentTool<'update_my_targets'> {
  constructor(
    private readonly goals: UserGoalsService,
    private readonly targets: NutrientTargetService,
  ) {
    super('update_my_targets');
  }

  async execute(input: IntentInput<'update_my_targets'>, { userId }: McpToolContext) {
    const { nutrient, ...metas } = input;
    const enviadas = Object.entries(metas).filter(([, v]) => v !== undefined);
    if (enviadas.length === 0 && nutrient === undefined) {
      throw new BadRequestException('Nada a ajustar: envie ao menos uma meta ou um nutriente.');
    }

    let goals: unknown = undefined;
    if (enviadas.length > 0) {
      const atuais = await this.goals.get(userId); // get_nutrition_goals
      const base: Record<string, number> = {};
      for (const campo of [...OBRIGATORIAS, ...OPCIONAIS]) {
        const valor = atuais?.[campo];
        if (typeof valor === 'number') base[campo] = valor;
      }
      const juntas = { ...base, ...Object.fromEntries(enviadas) } as Record<string, number>;
      const faltando = OBRIGATORIAS.filter((campo) => juntas[campo] === undefined);
      if (faltando.length > 0) {
        throw new BadRequestException(
          `Ainda não há metas definidas; para criar, informe também ${faltando.join(', ')}.`,
        );
      }
      goals = await this.goals.upsert(userId, {
        kcalMin: juntas.kcalMin,
        kcalMax: juntas.kcalMax,
        proteinMinG: juntas.proteinMinG,
        proteinMaxG: juntas.proteinMaxG,
        carbsMinG: juntas.carbsMinG,
        carbsMaxG: juntas.carbsMaxG,
        fatMinG: juntas.fatMinG,
        fatMaxG: juntas.fatMaxG,
        weeklyWorkouts: juntas.weeklyWorkouts,
        dailyStepsTarget: juntas.dailyStepsTarget,
        dailyWaterTargetMl: juntas.dailyWaterTargetMl,
      }); // set_nutrition_goals
    }

    const nutrientTarget =
      nutrient === undefined ? undefined : await this.targets.upsert(userId, nutrient); // set_nutrient_target
    return { ...(goals !== undefined && { goals }), ...(nutrientTarget && { nutrientTarget }) };
  }
}

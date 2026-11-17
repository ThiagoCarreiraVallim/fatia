import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OnboardingService } from '../onboarding.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class SuggestNutritionGoalsTool implements McpToolDef {
  constructor(private readonly onboarding: OnboardingService) {}
  readonly name = 'suggest_nutrition_goals';
  readonly title = 'Sugerir metas nutricionais';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'comparison' as const;
  readonly description =
    'Calcula metas sugeridas (gasto pela Mifflin-St Jeor × atividade, ajustado ao objetivo) sem gravar nada. ' +
    'Campos omitidos vêm do perfil e da última pesagem; para salvar, use set_nutrition_goals. ' +
    'Exemplo: {"sex":"FEMALE","birthDate":"1994-05-10","objective":"LOSE","activityLevel":"MODERATE"}';
  readonly inputSchema = {
    sex: z.enum(['FEMALE', 'MALE']).optional().describe('Sexo biológico, usado só na fórmula'),
    birthDate: z.string().optional().describe('Data de nascimento AAAA-MM-DD (16 a 100 anos)'),
    heightCm: z.number().optional().describe('Altura em cm (100 a 250)'),
    weightKg: z.number().optional().describe('Peso em kg (30 a 300)'),
    activityLevel: z
      .enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'])
      .optional()
      .describe('Nível de atividade da rotina'),
    objective: z
      .enum(['LOSE', 'MAINTAIN', 'GAIN'])
      .optional()
      .describe('Perder, manter ou ganhar peso'),
  } as const;
  execute(
    input: z.infer<z.ZodObject<typeof this.inputSchema>>,
    { userId, timezone }: McpToolContext,
  ) {
    return this.onboarding.suggest(userId, input, timezone);
  }

  /** O gasto calculado e as faixas sugeridas, lado a lado (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    const s = result as Awaited<ReturnType<OnboardingService['suggest']>>;
    const faixa = (min: number, max: number) => `${min}–${max}`;
    return {
      kind: 'comparison',
      label: 'Metas sugeridas',
      items: [
        { label: 'Gasto em repouso', value: s.bmr, unit: 'kcal' },
        { label: 'Gasto do dia', value: s.tdee, unit: 'kcal' },
        { label: 'Calorias', value: faixa(s.goals.kcalMin, s.goals.kcalMax), unit: 'kcal' },
        { label: 'Proteína', value: faixa(s.goals.proteinMinG, s.goals.proteinMaxG), unit: 'g' },
        { label: 'Carboidratos', value: faixa(s.goals.carbsMinG, s.goals.carbsMaxG), unit: 'g' },
        { label: 'Gordura', value: faixa(s.goals.fatMinG, s.goals.fatMaxG), unit: 'g' },
      ],
    };
  }
}

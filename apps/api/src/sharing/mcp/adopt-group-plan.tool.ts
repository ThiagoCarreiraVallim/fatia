import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ContentService } from '../content.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class AdoptGroupPlanTool implements McpToolDef {
  constructor(private readonly content: ContentService) {}
  readonly name = 'adopt_group_plan';
  readonly title = 'Adotar um plano pronto da comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Copia para a conta do usuário um plano pronto publicado por uma comunidade de que ele faz ' +
    'parte. Treino vira um plano de treino dele (uma vez só; se já adotou, responde com o plano ' +
    'que ele já tem). Nutrição guarda as refeições sugeridas como refeições salvas e, só com ' +
    'applyGoals true, substitui as metas de calorias e macros atuais pelas do plano: confirme ' +
    'com o usuário antes de trocar as metas. Depois de copiado, o plano é dele e não muda quando ' +
    'a comunidade edita o original. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"templateId":"66666666-7777-4888-9999-000000000000","applyGoals":false}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    templateId: z.string().describe('ID do plano pronto, como devolvido por list_group_plans'),
    applyGoals: z
      .boolean()
      .optional()
      .describe('Nutrição: trocar as metas atuais pelas do plano. Padrão: não'),
    saveMeals: z
      .boolean()
      .optional()
      .describe('Nutrição: guardar as refeições sugeridas como refeições salvas. Padrão: sim'),
  } as const;
  async execute(
    input: { groupId: string; templateId: string; applyGoals?: boolean; saveMeals?: boolean },
    { userId }: McpToolContext,
  ) {
    return this.content.adopt(userId, input.groupId, input.templateId, {
      applyGoals: input.applyGoals,
      saveMeals: input.saveMeals,
    });
  }
}

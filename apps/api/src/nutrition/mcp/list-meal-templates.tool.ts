import { Injectable } from '@nestjs/common';
import { MealTemplateService } from '../meal-template.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListMealTemplatesTool implements McpToolDef {
  constructor(private readonly templates: MealTemplateService) {}
  readonly name = 'list_meal_templates';
  readonly title = 'Listar refeições salvas';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lista as refeições salvas do usuário ("meu café de sempre"), com os itens. Registre uma com log_meal_template.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.templates.list(userId);
  }
}

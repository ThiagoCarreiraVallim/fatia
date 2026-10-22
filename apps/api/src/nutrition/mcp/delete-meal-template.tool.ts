import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealTemplateService } from '../meal-template.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeleteMealTemplateTool implements McpToolDef {
  constructor(private readonly templates: MealTemplateService) {}
  readonly name = 'delete_meal_template';
  readonly title = 'Excluir refeição salva';
  readonly annotations = { readOnlyHint: false, destructiveHint: true, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Apaga uma refeição salva. As refeições já registradas com ela continuam. ' +
    'Exemplo: {"id":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    id: z.string().uuid().describe('ID da refeição salva'),
  } as const;
  async execute({ id }: { id: string }, { userId }: McpToolContext) {
    await this.templates.remove(userId, id);
    return { deleted: id };
  }
}

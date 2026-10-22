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
export class ListGroupPlansTool implements McpToolDef {
  constructor(private readonly content: ContentService) {}
  readonly name = 'list_group_plans';
  readonly title = 'Planos prontos de uma comunidade';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Lista os planos prontos (treino e nutrição) que a equipe de uma comunidade publicou: título, ' +
    'nível, exercícios ou metas e refeições sugeridas, e se o usuário já adotou o de treino. ' +
    'Rascunhos da equipe não aparecem. Para adotar, use adopt_group_plan. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade, como devolvido por list_my_groups'),
  } as const;
  async execute({ groupId }: { groupId: string }, { userId }: McpToolContext) {
    return this.content.listTemplatesForMember(userId, groupId);
  }
}

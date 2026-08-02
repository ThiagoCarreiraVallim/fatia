import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MembershipService } from '../membership.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class LeaveGroupTool implements McpToolDef {
  constructor(private readonly memberships: MembershipService) {}
  readonly name = 'leave_group';
  readonly title = 'Sair de um grupo';
  readonly annotations = { readOnlyHint: false, destructiveHint: true };
  readonly hostedInference = false;
  readonly description =
    'Sai de uma academia ou grupo. A saída não passa pelo dono e ele não pode impedi-la. ' +
    'Todo acesso que profissionais daquele grupo tinham aos dados do usuário é revogado na ' +
    'mesma hora, e reverter exige entrar de novo e autorizar cada profissional outra vez. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555"}';
  // `groupId`, e não o id da associação: a associação de quem chama sai do
  // contexto autenticado. Não existe forma de pedir a saída de outra pessoa.
  readonly inputSchema = {
    groupId: z.string().describe('ID do grupo do qual sair, como devolvido por list_my_groups'),
  } as const;
  async execute({ groupId }: { groupId: string }, { userId }: McpToolContext) {
    return this.memberships.leave(userId, groupId);
  }
}

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChallengeService } from '../challenge.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class JoinGroupChallengeTool implements McpToolDef {
  constructor(private readonly challenges: ChallengeService) {}
  readonly name = 'join_group_challenge';
  readonly title = 'Entrar num desafio da comunidade';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Inscreve o usuário num desafio marcado ou em andamento de uma comunidade de que ele faz ' +
    'parte. Os outros participantes passam a ver o apelido e a pontuação dele no ranking; nenhum ' +
    'valor de refeição, peso ou meta aparece. Sem displayName, usa o apelido que ele já tem na ' +
    'comunidade ou o primeiro nome: confirme com o usuário como ele quer aparecer. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"challengeId":"66666666-7777-4888-9999-000000000000","displayName":"Ana"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    challengeId: z.string().describe('ID do desafio, como devolvido por list_group_challenges'),
    displayName: z
      .string()
      .optional()
      .describe('Apelido no ranking, de 2 a 30 caracteres. Padrão: o da comunidade'),
  } as const;
  async execute(
    input: { groupId: string; challengeId: string; displayName?: string },
    { userId }: McpToolContext,
  ) {
    return this.challenges.join(userId, input.groupId, input.challengeId, input.displayName);
  }
}

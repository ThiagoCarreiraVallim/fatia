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
export class GetChallengeLeaderboardTool implements McpToolDef {
  constructor(private readonly challenges: ChallengeService) {}
  readonly name = 'get_challenge_leaderboard';
  readonly title = 'Ranking de um desafio';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Mostra um desafio da comunidade e o ranking: apelido, pontuação e posição de cada ' +
    'participante, com a linha do usuário marcada (isMe). O ranking só vem para quem participa; ' +
    'para os outros, leaderboard é null e dá para entrar com join_group_challenge. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555",' +
    '"challengeId":"66666666-7777-4888-9999-000000000000"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade'),
    challengeId: z.string().describe('ID do desafio, como devolvido por list_group_challenges'),
  } as const;
  async execute(
    { groupId, challengeId }: { groupId: string; challengeId: string },
    { userId }: McpToolContext,
  ) {
    return this.challenges.get(userId, groupId, challengeId);
  }
}

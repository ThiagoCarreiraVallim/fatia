import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChallengeService } from '../challenge.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { challengeUnit } from './challenge-unit';

@Injectable()
@McpTool()
export class GetChallengeLeaderboardTool implements McpToolDef {
  constructor(private readonly challenges: ChallengeService) {}
  readonly name = 'get_challenge_leaderboard';
  readonly title = 'Ranking de um desafio';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'scoreboard' as const;
  readonly description =
    'Mostra um desafio da comunidade e o ranking: apelido, pontuação (dias na meta, ou pontos ' +
    'no tipo POINTS), sequência e posição de cada participante, com a linha do usuário marcada ' +
    '(isMe). Quem é da comunidade vê o ranking mesmo sem participar (leaderboard null só nos ' +
    'desafios antigos que somavam ml ou passos). today traz o hoje do próprio usuário. Fotos de ' +
    'check-in nunca vêm: só a pessoa e a equipe as veem. ' +
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

  /**
   * As posições do desafio, com a sua linha marcada (prancha IA-Cartoes, #384). Sem placar
   * (desafio antigo de ml ou passos, visto de fora), fica sem cartão.
   */
  artifact(result: unknown) {
    const desafio = result as Awaited<ReturnType<ChallengeService['get']>>;
    if (!desafio.leaderboard) return null;
    const unit = challengeUnit(desafio.kind, desafio.metric);
    return {
      kind: 'scoreboard',
      label: desafio.title,
      entries: desafio.leaderboard.map((linha) => ({
        position: linha.rank,
        name: linha.displayName,
        value: linha.score,
        unit,
        ...(linha.isMe ? { you: true } : {}),
      })),
    };
  }
}

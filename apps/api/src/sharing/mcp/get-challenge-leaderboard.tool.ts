import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChallengeService } from '../challenge.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import type { ChallengeMetric } from '../../social/challenge-metric';

/** A unidade do placar de cada métrica; as de dias contam dias. */
const CHALLENGE_UNIT: Record<ChallengeMetric, string> = {
  WORKOUT_SESSIONS: 'treinos',
  STEPS: 'passos',
  WATER_ML: 'ml',
  ACTIVE_DAYS: 'dias',
  KCAL_IN_RANGE_DAYS: 'dias',
  PROTEIN_TARGET_DAYS: 'dias',
  STREAK_DAYS: 'dias',
};

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

  /**
   * As posições do desafio, com a sua linha marcada (prancha IA-Cartoes, #384). Quem não
   * entrou no desafio não vê o placar, e fica sem cartão.
   */
  artifact(result: unknown) {
    const desafio = result as Awaited<ReturnType<ChallengeService['get']>>;
    if (!desafio.leaderboard) return null;
    const unit = CHALLENGE_UNIT[desafio.metric];
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

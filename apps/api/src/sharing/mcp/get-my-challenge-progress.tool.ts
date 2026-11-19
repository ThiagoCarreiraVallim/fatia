import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ChallengeService } from '../challenge.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { challengeUnit } from './challenge-unit';

/**
 * "Como estou nos desafios?" (#395), só leitura. Check-in, sinalização e
 * revisão ficam no app (ADR 044): a foto de prova não passa pela IA.
 */
@Injectable()
@McpTool()
export class GetMyChallengeProgressTool implements McpToolDef {
  constructor(private readonly challenges: ChallengeService) {}
  readonly name = 'get_my_challenge_progress';
  readonly title = 'Meu progresso nos desafios';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Mostra como o usuário vai nos desafios de uma comunidade em que ele está e que não ' +
    'acabaram: tipo, dias ou pontos, posição, dias seguidos (streak), itens esperando a equipe ' +
    '(pendingReview) e, nos em andamento, o hoje dele (today: pontos e cada item feito ou não). ' +
    'Só os dados do próprio usuário. O check-in com foto é feito no app, nunca por aqui. ' +
    'Exemplo: {"groupId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    groupId: z.string().describe('ID da comunidade, como devolvido por list_my_groups'),
  } as const;
  async execute({ groupId }: { groupId: string }, { userId }: McpToolContext) {
    return this.challenges.myProgress(userId, groupId);
  }

  /** Um item por desafio: "3 dias · 2º lugar · 2 seguidos". */
  artifact(result: unknown) {
    const meus = result as Awaited<ReturnType<ChallengeService['myProgress']>>;
    if (meus.length === 0) return null;
    return {
      kind: 'list',
      label: 'Seus desafios',
      items: meus.map((c) => {
        const partes = [
          `${c.score} ${challengeUnit(c.kind, c.metric)}`,
          c.rank ? `${c.rank}º lugar` : 'começa em breve',
        ];
        if (c.streak > 1) partes.push(`${c.streak} seguidos`);
        if (c.pendingReview > 0) partes.push('em revisão');
        return { title: c.title, detail: partes.join(' · ') };
      }),
    };
  }
}

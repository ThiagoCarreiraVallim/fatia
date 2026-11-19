import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { WorkoutSessionService } from '../workout-session.service';

const scale = (what: string) =>
  z.number().int().min(1).max(5).optional().describe(`${what}, de 1 a 5`);

@Injectable()
@McpTool()
export class FinishWorkoutSessionTool implements McpToolDef {
  constructor(private readonly sessions: WorkoutSessionService) {}

  readonly name = 'finish_workout_session';

  readonly title = 'Finalizar treino';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;

  readonly card = 'confirm' as const;
  readonly aiCategory = 'WORKOUT' as const;
  readonly description =
    'Finaliza uma sessão de treino, registrando o horário de conclusão. ' +
    'Para treino já ocorrido (ex.: "ontem eu treinei"), informe completedAt — ' +
    'sem ele o fim é agora, e a sessão fica com a duração errada. ' +
    'Também grava como foi o treino (feeling: 1 Leve, 2 Firme, 3 Puxado, 4 Muito puxado, ' +
    '5 No limite) e as respostas rápidas pós-treino que a equipe lê com Treino liberado ' +
    '(difficulty, fatigue, motivation de 1 a 5; pain e painLocation). Chamar de novo numa ' +
    'sessão já finalizada não muda o horário: só atualiza sensação e respostas. Sessão de ' +
    'circuito sem resultado dá conflito: registre com log_circuit_result. ' +
    'Exemplo: {"sessionId":"11111111-2222-4333-8444-555555555555","completedAt":"2026-07-31T20:15:00-03:00","notes":"treino completo","feeling":3,"fatigue":4,"pain":true,"painLocation":"joelho direito"}';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão a finalizar'),
    notes: z.string().max(500).optional().describe('Notas finais do treino'),
    completedAt: z
      .string()
      .optional()
      .describe(
        'Quando o treino terminou, em ISO 8601 (ex.: 2026-07-31T20:15:00-03:00). ' +
          'Default: agora. Precisa ser depois do início e não pode estar no futuro.',
      ),
    feeling: scale('Como foi o treino: 1 Leve, 2 Firme, 3 Puxado, 4 Muito puxado, 5 No limite'),
    difficulty: scale('Dificuldade percebida'),
    fatigue: scale('Cansaço depois do treino (1 leve, 5 no limite)'),
    pain: z.boolean().optional().describe('Sentiu dor ou desconforto'),
    painLocation: z
      .string()
      .max(120)
      .optional()
      .describe('Onde doeu (ex.: "joelho direito"). Só com pain: true'),
    motivation: scale('Motivação'),
  } as const;

  execute(
    input: {
      sessionId: string;
      notes?: string;
      completedAt?: string;
      feeling?: number;
      difficulty?: number;
      fatigue?: number;
      pain?: boolean;
      painLocation?: string;
      motivation?: number;
    },
    { userId }: McpToolContext,
  ) {
    const { difficulty, fatigue, pain, painLocation, motivation } = input;
    const answered = [difficulty, fatigue, pain, painLocation, motivation].some(
      (v) => v !== undefined,
    );
    return this.sessions.finish(userId, input.sessionId, {
      notes: input.notes,
      completedAt: input.completedAt,
      feeling: input.feeling,
      ...(answered ? { checkin: { difficulty, fatigue, pain, painLocation, motivation } } : {}),
    });
  }
}

import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { CircuitSessionService } from '../circuit-session.service';

@Injectable()
@McpTool()
export class LogCircuitResultTool implements McpToolDef {
  constructor(private readonly circuits: CircuitSessionService) {}

  readonly name = 'log_circuit_result';

  readonly title = 'Registrar circuito feito';

  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };

  readonly hostedInference = false;
  readonly description =
    'Registra o resultado de um circuito (plano com circuit, de create_workout_plan): rounds e ' +
    'exercícios do round incompleto (AMRAP e For Time), tempo final (For Time terminado), ' +
    'minutos ou intervalos feitos (EMOM e Tabata; sem eles, conta o circuito inteiro). Grava uma ' +
    'série por exercício por round. Com sessionId, encerra a sessão de circuito aberta no app; ' +
    'sem ele, cria a sessão já terminada (completedAt, padrão agora). ' +
    'Exemplo: {"planId":"11111111-2222-4333-8444-555555555555","roundsCompleted":5,"partialExercises":2,"feeling":4} ' +
    'Exemplo (For Time): {"planId":"11111111-2222-4333-8444-555555555555","finalTimeSeconds":874,"roundSeconds":[170,172,175,178,179]}';
  readonly inputSchema = {
    planId: z.string().uuid().describe('ID do circuito (plano com circuit)'),
    sessionId: z
      .string()
      .uuid()
      .optional()
      .describe('Sessão de circuito aberta, quando o circuito foi começado no app'),
    roundsCompleted: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional()
      .describe('AMRAP e For Time: rounds completos'),
    partialExercises: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe('Exercícios feitos no round que não fechou'),
    finalTimeSeconds: z
      .number()
      .int()
      .min(1)
      .max(21600)
      .optional()
      .describe('For Time terminado: tempo final em segundos'),
    roundSeconds: z
      .array(z.number().int().min(0).max(21600))
      .max(1000)
      .optional()
      .describe('Tempo de cada round completo, em segundos'),
    intervalsCompleted: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe('EMOM: minutos feitos; Tabata: intervalos feitos'),
    elapsedSeconds: z
      .number()
      .int()
      .min(1)
      .max(21600)
      .optional()
      .describe('Duração em segundos (padrão: a do circuito, ou o tempo final)'),
    completedAt: z
      .string()
      .optional()
      .describe('Quando terminou, ISO 8601 (padrão: agora). Não pode estar no futuro.'),
    feeling: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Como foi: 1 Leve, 2 Firme, 3 Puxado, 4 Muito puxado, 5 No limite'),
    notes: z.string().max(500).optional().describe('Observação'),
  } as const;

  execute(
    input: {
      planId: string;
      sessionId?: string;
      roundsCompleted?: number;
      partialExercises?: number;
      finalTimeSeconds?: number;
      roundSeconds?: number[];
      intervalsCompleted?: number;
      elapsedSeconds?: number;
      completedAt?: string;
      feeling?: number;
      notes?: string;
    },
    { userId }: McpToolContext,
  ) {
    return this.circuits.log(userId, input);
  }
}

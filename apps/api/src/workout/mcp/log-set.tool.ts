import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { SessionSetService } from '../session-set.service';

@Injectable()
@McpTool()
export class LogSetTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'log_set';

  readonly title = 'Registrar série';

  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Registra uma série em uma sessão de treino. Para força: informe weightKg e reps. Para cardio: informe durationSeconds. ' +
    'Exemplo (força): {"sessionId":"11111111-2222-4333-8444-555555555555","exerciseId":42,"weightKg":80,"reps":8,"rpe":8} ' +
    'Exemplo (cardio): {"sessionId":"11111111-2222-4333-8444-555555555555","exerciseId":77,"durationSeconds":1800,"distanceMeters":5000,"avgHeartRate":148}';
  readonly inputSchema = {
    sessionId: z.string().uuid().describe('ID da sessão'),
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    // força
    weightKg: z.number().min(0).optional().describe('Peso em kg (exercícios de força)'),
    reps: z.number().int().min(0).optional().describe('Repetições (exercícios de força)'),
    rpe: z.number().min(0).max(10).optional().describe('RPE 0-10 (esforço percebido)'),
    // cardio
    durationSeconds: z.number().int().min(1).optional().describe('Duração em segundos (cardio)'),
    distanceMeters: z.number().min(0).optional().describe('Distância em metros (cardio)'),
    avgHeartRate: z.number().int().min(0).optional().describe('Frequência cardíaca média (bpm)'),
    kcalBurned: z.number().int().min(0).optional().describe('Calorias queimadas estimadas'),
    notes: z.string().max(500).optional().describe('Notas da série'),
  } as const;

  execute(
    input: {
      sessionId: string;
      exerciseId: number;
      weightKg?: number;
      reps?: number;
      rpe?: number;
      durationSeconds?: number;
      distanceMeters?: number;
      avgHeartRate?: number;
      kcalBurned?: number;
      notes?: string;
    },
    { userId }: McpToolContext,
  ) {
    return this.sets.create(userId, input);
  }
}

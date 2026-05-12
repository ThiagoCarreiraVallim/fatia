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
export class UpdateSetTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'update_set';
  readonly description = 'Corrige os dados de uma série já registrada.';
  readonly inputSchema = {
    setId: z.string().uuid().describe('ID da série'),
    weightKg: z.number().min(0).optional().describe('Peso corrigido (kg)'),
    reps: z.number().int().min(0).optional().describe('Repetições corrigidas'),
    rpe: z.number().min(0).max(10).optional().describe('RPE corrigido'),
    durationSeconds: z.number().int().min(1).optional().describe('Duração corrigida (segundos)'),
    distanceMeters: z.number().min(0).optional().describe('Distância corrigida (metros)'),
    avgHeartRate: z.number().int().min(0).optional().describe('FC média corrigida (bpm)'),
    kcalBurned: z.number().int().min(0).optional().describe('Calorias corrigidas'),
    notes: z.string().max(500).optional().describe('Notas corrigidas'),
  } as const;

  execute(
    input: {
      setId: string;
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
    const { setId, ...fields } = input;
    return this.sets.update(userId, setId, fields);
  }
}

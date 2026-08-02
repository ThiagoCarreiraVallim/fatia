import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { PrescriptionService } from '../prescription.service';

@Injectable()
@McpTool()
export class GetLoadPrescriptionTool implements McpToolDef {
  constructor(private readonly prescriptions: PrescriptionService) {}

  readonly name = 'get_load_prescription';

  readonly title = 'Sugerir carga e repetições';

  readonly annotations = { readOnlyHint: true, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Sugere carga, repetições e descanso da próxima sessão de um exercício de força, a partir do histórico e do RPE registrado. Só considera sessões concluídas: a que está em andamento não entra. Devolve status "insufficient_history" quando há menos de 2 sessões concluídas — nesse caso não invente uma carga.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('ID do exercício'),
    targetReps: z
      .string()
      .optional()
      .describe('Faixa de repetições alvo, como "8-12" ou "5". Padrão: 8-12'),
  } as const;

  execute(input: { exerciseId: number; targetReps?: string }, { userId }: McpToolContext) {
    return this.prescriptions.forExercise(userId, input.exerciseId, input.targetReps);
  }
}

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
export class GetPersonalRecordTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'get_personal_record';

  readonly title = 'Ver recorde pessoal';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'metric' as const;
  readonly description =
    'Retorna o recorde pessoal para um exercício. Para força: maior peso × reps. Para cardio: maior distância em uma sessão.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('ID do exercício'),
  } as const;

  execute(input: { exerciseId: number }, { userId }: McpToolContext) {
    return this.sets.getPersonalRecord(userId, input.exerciseId);
  }

  /**
   * O recorde: a maior carga, com as repetições dela; no cardio, a maior distância numa sessão
   * (prancha IA-Cartoes, #384). Sem registro, não há cartão.
   */
  artifact(result: unknown) {
    const recorde = result as Awaited<ReturnType<SessionSetService['getPersonalRecord']>>;
    if (!recorde) return null;
    if ('weightKg' in recorde) {
      if (recorde.weightKg == null) return null;
      return {
        kind: 'metric',
        label: 'Recorde pessoal',
        value: recorde.weightKg,
        unit: 'kg',
        ...(recorde.reps == null
          ? {}
          : { breakdown: [{ label: 'Repetições', value: recorde.reps }] }),
      };
    }
    if (recorde.distanceMeters == null) return null;
    return {
      kind: 'metric',
      label: 'Maior distância numa sessão',
      value: recorde.distanceMeters / 1000,
      unit: 'km',
      ...(recorde.durationSeconds == null
        ? {}
        : {
            breakdown: [
              { label: 'Tempo', value: Math.round(recorde.durationSeconds / 60), unit: 'min' },
            ],
          }),
    };
  }
}

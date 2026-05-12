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
  readonly description =
    'Retorna o recorde pessoal para um exercício. Para força: maior peso × reps. Para cardio: maior distância em uma sessão.';
  readonly inputSchema = {
    exerciseId: z.number().int().positive().describe('ID do exercício'),
  } as const;

  execute(input: { exerciseId: number }, { userId }: McpToolContext) {
    return this.sets.getPersonalRecord(userId, input.exerciseId);
  }
}

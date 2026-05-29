import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { SessionSetService } from '../session-set.service';

@Injectable()
@McpTool()
export class ListPersonalRecordsTool implements McpToolDef {
  constructor(private readonly sets: SessionSetService) {}

  readonly name = 'list_personal_records';
  readonly description =
    'Lista o recorde pessoal de cada exercício que o usuário já treinou. Força: maior carga (kg), reps na carga máxima e 1RM estimado. Cardio: maior distância e a duração dessa sessão. Inclui data do recorde, última vez treinado e total de séries. Ordenado do mais recente para o mais antigo.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.sets.listPersonalRecords(userId);
  }
}

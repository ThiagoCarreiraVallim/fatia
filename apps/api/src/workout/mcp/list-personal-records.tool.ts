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

  readonly title = 'Listar recordes pessoais';

  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly card = 'report' as const;
  readonly description =
    'Lista o recorde pessoal de cada exercício que o usuário já treinou, em `records`. Força: maior carga (kg), reps na carga máxima, 1RM estimado e `monthEvolution` (1RM estimado do começo e do fim dos últimos 30 dias, em %). Cardio: maior distância e a duração dessa sessão. Inclui data do recorde, última vez treinado e total de séries, do mais recente para o mais antigo. `highlight` é a maior evolução do mês (ou null).';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.sets.recordsOverview(userId);
  }
}

import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { TrainingBlockService } from '../training-block.service';

@Injectable()
@McpTool()
export class GetTrainingBlockTool implements McpToolDef {
  constructor(private readonly blocks: TrainingBlockService) {}

  readonly name = 'get_training_block';

  readonly title = 'Ver o bloco de periodização em andamento';

  readonly annotations = { readOnlyHint: true, destructiveHint: false };

  readonly hostedInference = false;
  readonly description =
    'Devolve o bloco de periodização ativo já reconciliado com o calendário real: em que semana a pessoa está, o que vem na seguinte, quantas sessões faltam e se alguma semana foi reancorada por falta. Devolve null quando não há bloco ativo — nesse caso não invente uma semana. Semana perdida por inteiro empurra o bloco 7 dias em vez de pular a semana.';
  readonly inputSchema = {} as const;

  execute(_input: unknown, { userId, timezone }: McpToolContext) {
    return this.blocks.getActive({ userId, timezone });
  }
}

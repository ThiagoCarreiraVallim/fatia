import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { TrainingBlockService } from '../training-block.service';

@Injectable()
@McpTool()
export class DeleteTrainingBlockTool implements McpToolDef {
  constructor(private readonly blocks: TrainingBlockService) {}

  readonly name = 'delete_training_block';

  readonly title = 'Encerrar bloco de periodização';

  readonly annotations = { readOnlyHint: false, destructiveHint: true };

  readonly hostedInference = false;
  readonly description =
    'Encerra o bloco de periodização informado, liberando a criação de um novo. O histórico de treinos não é apagado — só o bloco deixa de ser o plano corrente. ' +
    'Exemplo: {"blockId":"3f7c1c2e-9a4b-4b1e-8f0d-2c5a6b7d8e90"}';
  readonly inputSchema = {
    blockId: z.string().uuid().describe('ID do bloco de periodização a encerrar'),
  } as const;

  async execute(input: { blockId: string }, { userId, timezone }: McpToolContext) {
    await this.blocks.abandon({ userId, timezone }, input.blockId);
    return { ok: true };
  }
}

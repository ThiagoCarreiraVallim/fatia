import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MealCopyService } from '../meal-copy.service';
import { YMD } from '../dto/meal-template.dto';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class CopyDayTool implements McpToolDef {
  constructor(private readonly copies: MealCopyService) {}
  readonly name = 'copy_day';
  readonly title = 'Copiar dia de refeições';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Copia todas as refeições de um dia para outro. As que já estão no destino são puladas e contadas em skipped. ' +
    'Exemplo: {"fromDate":"2026-07-29","toDate":"2026-07-30"}';
  readonly inputSchema = {
    fromDate: z.string().regex(YMD).describe('Dia de origem, YYYY-MM-DD'),
    toDate: z.string().regex(YMD).describe('Dia de destino, YYYY-MM-DD'),
  } as const;
  execute(input: { fromDate: string; toDate: string }, { userId, timezone }: McpToolContext) {
    return this.copies.copyDay(userId, input.fromDate, input.toDate, timezone);
  }
}

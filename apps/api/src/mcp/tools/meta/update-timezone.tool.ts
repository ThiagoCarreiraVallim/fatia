// apps/api/src/mcp/tools/meta/update-timezone.tool.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { isTimeZone } from 'class-validator';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateTimezoneTool implements McpToolDef {
  constructor(private readonly prisma: PrismaService) {}
  readonly name = 'update_timezone';
  readonly title = 'Atualizar fuso horário';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Atualiza o fuso horário do usuário (IANA, ex.: "America/Sao_Paulo"). ' +
    'Exemplo: {"timezone":"America/Sao_Paulo"}';
  readonly inputSchema = {
    timezone: z
      .string()
      .min(3)
      .max(60)
      .describe('Fuso horário IANA (ex.: "America/Sao_Paulo") — define o corte dos dias'),
  } as const;
  async execute({ timezone }: { timezone: string }, { userId }: McpToolContext) {
    // Fuso que não existe quebraria o corte dos dias e os avisos de cobrança.
    if (!isTimeZone(timezone)) {
      throw new BadRequestException(`timezone "${timezone}" não é um fuso IANA`);
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
      select: { id: true, timezone: true },
    });
  }
}

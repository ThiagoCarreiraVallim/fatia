// apps/api/src/mcp/tools/meta/update-timezone.tool.ts
import { Injectable } from '@nestjs/common';
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
  readonly description = 'Atualiza o fuso horário do usuário (IANA, ex.: "America/Sao_Paulo").';
  readonly inputSchema = { timezone: z.string().min(3).max(60) } as const;
  execute({ timezone }: { timezone: string }, { userId }: McpToolContext) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
      select: { id: true, timezone: true },
    });
  }
}

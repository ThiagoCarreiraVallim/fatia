// apps/api/src/mcp/tools/meta/update-me.tool.ts
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
export class UpdateMeTool implements McpToolDef {
  constructor(private readonly prisma: PrismaService) {}
  readonly name = 'update_me';
  readonly description = 'Atualiza o perfil do usuário (nome, estatura, fuso horário).';
  readonly inputSchema = {
    name: z.string().min(1).max(120).optional(),
    heightCm: z.number().positive().optional(),
    timezone: z.string().min(3).max(60).optional(),
  } as const;
  execute(
    input: { name?: string; heightCm?: number; timezone?: string },
    { userId }: McpToolContext,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.heightCm !== undefined && { heightCm: input.heightCm }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
      select: { id: true, email: true, name: true, role: true, timezone: true, heightCm: true },
    });
  }
}

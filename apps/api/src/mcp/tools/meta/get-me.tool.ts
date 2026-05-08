// apps/api/src/mcp/tools/meta/get-me.tool.ts
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
export class GetMeTool implements McpToolDef {
  constructor(private readonly prisma: PrismaService) {}
  readonly name = 'get_me';
  readonly description = 'Retorna o perfil do usuário autenticado.';
  readonly inputSchema = {} as const;
  execute(_input: z.infer<z.ZodObject<typeof this.inputSchema>>, { userId }: McpToolContext) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, timezone: true },
    });
  }
}

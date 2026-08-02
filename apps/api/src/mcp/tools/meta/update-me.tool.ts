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
  readonly title = 'Atualizar meu perfil';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Atualiza o perfil do usuário (nome, estatura, fuso horário). ' +
    'Exemplo: {"name":"Ana Souza","heightCm":178,"timezone":"America/Sao_Paulo"}';
  readonly inputSchema = {
    name: z.string().min(1).max(120).optional().describe('Novo nome de exibição do usuário'),
    heightCm: z
      .number()
      .positive()
      .optional()
      .describe('Altura em centímetros (ex.: 178) — usada para calcular IMC'),
    timezone: z
      .string()
      .min(3)
      .max(60)
      .optional()
      .describe('Fuso horário IANA (ex.: "America/Sao_Paulo") — define o corte dos dias'),
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

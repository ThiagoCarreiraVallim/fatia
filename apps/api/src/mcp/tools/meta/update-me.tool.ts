// apps/api/src/mcp/tools/meta/update-me.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma.service';
import { USER_SELECT } from '../../../users/user-select';
import { profileUpdateData, type ProfileUpdate } from '../../../users/profile-update';
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
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Atualiza o perfil do usuário (nome, estatura, fuso horário e os dados da sugestão de metas). ' +
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
    sex: z
      .enum(['FEMALE', 'MALE'])
      .optional()
      .describe('Sexo biológico, usado só na sugestão de metas'),
    birthDate: z.string().optional().describe('Data de nascimento AAAA-MM-DD'),
    activityLevel: z
      .enum(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE'])
      .optional()
      .describe('Nível de atividade da rotina'),
    objective: z
      .enum(['LOSE', 'MAINTAIN', 'GAIN'])
      .optional()
      .describe('Perder, manter ou ganhar peso'),
  } as const;
  execute(input: ProfileUpdate, { userId, timezone }: McpToolContext) {
    return this.prisma.user.update({
      where: { id: userId },
      data: profileUpdateData(input, timezone),
      select: USER_SELECT,
    });
  }
}

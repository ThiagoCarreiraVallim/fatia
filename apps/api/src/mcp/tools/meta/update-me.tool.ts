// apps/api/src/mcp/tools/meta/update-me.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProfileService } from '../../../users/profile.service';
import { BIO_MAX, type ProfileUpdate } from '../../../users/profile-update';
import { DISPLAY_NAME_MAX } from '../../../sharing/display-name';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class UpdateMeTool implements McpToolDef {
  constructor(private readonly profile: ProfileService) {}
  readonly name = 'update_me';
  readonly title = 'Atualizar meu perfil';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly description =
    'Atualiza o perfil do usuário (nome, estatura, fuso horário, os dados da sugestão de metas, o apelido e a bio ' +
    'das comunidades e as unidades de exibição). Só o que vier é alterado; string vazia apaga apelido e bio. ' +
    'As unidades mudam só como o app mostra: nada registrado é convertido. ' +
    'Exemplo: {"nickname":"Ana","bio":"Correndo minha primeira 10 km","loadUnit":"LB"}';
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
    nickname: z
      .string()
      .max(DISPLAY_NAME_MAX)
      .optional()
      .describe(
        `Como aparece no mural, nos comentários e no ranking das comunidades (2 a ${DISPLAY_NAME_MAX} caracteres; vazio apaga)`,
      ),
    bio: z
      .string()
      .max(BIO_MAX)
      .optional()
      .describe(`"Sobre você" do perfil, até ${BIO_MAX} caracteres (vazio apaga)`),
    loadUnit: z
      .enum(['KG', 'LB'])
      .optional()
      .describe('Unidade em que o app mostra a carga dos treinos'),
    distanceUnit: z
      .enum(['KM', 'M', 'MI'])
      .optional()
      .describe('Unidade em que o app mostra distância (km, metros ou milhas)'),
  } as const;
  execute(input: ProfileUpdate, { userId, timezone }: McpToolContext) {
    return this.profile.updateMe(userId, input, timezone);
  }
}

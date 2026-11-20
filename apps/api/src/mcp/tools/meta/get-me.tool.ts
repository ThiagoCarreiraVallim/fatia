// apps/api/src/mcp/tools/meta/get-me.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiAccessService } from '../../../ai/ai-access.service';
import { ProfileService } from '../../../users/profile.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetMeTool implements McpToolDef {
  constructor(
    private readonly profile: ProfileService,
    private readonly access: AiAccessService,
  ) {}
  readonly name = 'get_me';
  readonly title = 'Ver meu perfil';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Retorna o perfil do usuário autenticado: nome, e-mail, estatura, fuso, dados da sugestão de metas, ' +
    'apelido e bio das comunidades, quem vê a foto, a preferência de guardar fotos das refeições e as ' +
    'unidades de exibição (loadUnit KG|LB, distanceUnit KM|M|MI). Os valores do diário continuam ' +
    'sempre em kg e metros — a unidade só muda como o app mostra; converta ao falar com o usuário.';
  readonly inputSchema = {} as const;
  async execute(_input: z.infer<z.ZodObject<typeof this.inputSchema>>, { userId }: McpToolContext) {
    const [me, pro] = await Promise.all([
      this.profile.getMe(userId),
      this.access.proStatus(userId),
    ]);
    return { ...me, pro };
  }
}

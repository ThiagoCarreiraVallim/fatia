// apps/api/src/mcp/tools/meta/get-me.tool.ts
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProfileService } from '../../../users/profile.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GetMeTool implements McpToolDef {
  constructor(private readonly profile: ProfileService) {}
  readonly name = 'get_me';
  readonly title = 'Ver meu perfil';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly description =
    'Retorna o perfil do usuário autenticado: nome, e-mail, estatura, fuso, dados da sugestão de metas, ' +
    'apelido e bio das comunidades, quem vê a foto, a preferência de guardar fotos das refeições e as ' +
    'unidades de exibição (loadUnit KG|LB, distanceUnit KM|M|MI). Os valores do diário continuam ' +
    'sempre em kg e metros — a unidade só muda como o app mostra; converta ao falar com o usuário.';
  readonly inputSchema = {} as const;
  execute(_input: z.infer<z.ZodObject<typeof this.inputSchema>>, { userId }: McpToolContext) {
    return this.profile.getMe(userId);
  }
}

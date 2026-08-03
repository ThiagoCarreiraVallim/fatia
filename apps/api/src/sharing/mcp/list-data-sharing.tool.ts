import { Injectable } from '@nestjs/common';
import { ConsentService } from '../consent.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListDataSharingTool implements McpToolDef {
  constructor(private readonly consent: ConsentService) {}
  readonly name = 'list_data_sharing';
  readonly title = 'Ver quem tem acesso aos meus dados';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Responde "quem consegue ver o quê de mim": lista cada profissional autorizado pelo usuário, ' +
    'em qual grupo, quais categorias de dado foram consentidas (treino, alimentação, corpo, ' +
    'hábitos, metas) e desde quando. Lista vazia significa que ninguém tem acesso — que é o ' +
    'estado inicial de toda conta, porque entrar num grupo não concede nada.';
  readonly inputSchema = {} as const;
  async execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.consent.listMine(userId);
  }
}

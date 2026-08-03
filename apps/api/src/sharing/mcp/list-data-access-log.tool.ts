import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ConsentService } from '../consent.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListDataAccessLogTool implements McpToolDef {
  constructor(private readonly consent: ConsentService) {}
  readonly name = 'list_data_access_log';
  readonly title = 'Quem olhou meus dados';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Trilha de acesso do usuário: cada vez que um profissional leu — ou TENTOU ler — dados dele, ' +
    'com data, categoria e a operação. As tentativas barradas aparecem marcadas, e são as mais ' +
    'importantes: uma sequência delas é o sinal de que alguém está sondando o que não foi ' +
    'consentido. A trilha registra que houve leitura, nunca o conteúdo lido.';
  readonly inputSchema = {
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Quantas linhas devolver, da mais recente para a mais antiga (padrão 50)'),
  } as const;
  async execute({ limit }: { limit?: number }, { userId }: McpToolContext) {
    return this.consent.listAccessLog(userId, limit);
  }
}

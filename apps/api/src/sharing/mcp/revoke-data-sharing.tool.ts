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
export class RevokeDataSharingTool implements McpToolDef {
  constructor(private readonly consent: ConsentService) {}
  readonly name = 'revoke_data_sharing';
  readonly title = 'Revogar o acesso de um profissional';
  /**
   * `destructiveHint: false` mesmo sendo escrita, e é decisão, não descuido:
   * revogar é o lado **seguro** desta gangorra. Pedir confirmação para cortar o
   * acesso — e não para concedê-lo — poria fricção justamente no controle que o
   * titular exerce sobre o próprio dado. Nada é perdido: a linha sobrevive com
   * `revokedAt`, e conceder de novo é uma chamada.
   */
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Corta o acesso de um profissional aos dados do usuário, em todas as categorias de uma vez. ' +
    'Vale a partir da próxima requisição dele. O registro de que o acesso existiu permanece, ' +
    'para responder depois "quem teve acesso a quê, e quando" — o que some é a permissão. ' +
    'Exemplo: {"linkId":"11111111-2222-4333-8444-555555555555"}';
  readonly inputSchema = {
    linkId: z
      .string()
      .describe('ID da autorização a revogar, como devolvido por list_data_sharing'),
  } as const;
  async execute({ linkId }: { linkId: string }, { userId }: McpToolContext) {
    return this.consent.revoke(userId, linkId);
  }
}

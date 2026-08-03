import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ShareScope } from '@fatia/db';
import { ConsentService } from '../consent.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class GrantDataSharingTool implements McpToolDef {
  constructor(private readonly consent: ConsentService) {}
  readonly name = 'grant_data_sharing';
  readonly title = 'Autorizar um profissional a ver meus dados';
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly hostedInference = false;
  readonly description =
    'Autoriza UM profissional de um grupo a ler categorias específicas dos dados do usuário. ' +
    'Substitui a autorização anterior daquele profissional: a lista enviada passa a ser a lista ' +
    'inteira, e enviar [] equivale a revogar. Cada categoria é independente — consentir treino ' +
    'não abre o diário alimentar. Confirme com o usuário quais categorias ele quer, uma a uma, e ' +
    'nunca envie todas por conveniência. ' +
    'Exemplo: {"professionalMembershipId":"11111111-2222-4333-8444-555555555555","scopes":["WORKOUT","GOALS"]}';
  /**
   * `professionalMembershipId` é a associação do PROFISSIONAL no grupo, como
   * devolvida pelo painel do grupo — nunca o id de usuário dele. O grupo sai
   * dessa mesma linha, e o `ConsentService` confere que o titular está no mesmo
   * grupo antes de gravar (#204).
   */
  readonly inputSchema = {
    professionalMembershipId: z
      .string()
      .describe('ID da associação do profissional no grupo, como aparece na lista de membros'),
    scopes: z
      .array(z.nativeEnum(ShareScope))
      .describe(
        'Categorias autorizadas: WORKOUT (treino), NUTRITION (alimentação), BODY (peso e ' +
          'medidas), HABITS (água e passos), GOALS (metas). Lista vazia revoga tudo',
      ),
  } as const;
  async execute(
    {
      professionalMembershipId,
      scopes,
    }: { professionalMembershipId: string; scopes: ShareScope[] },
    { userId }: McpToolContext,
  ) {
    return this.consent.grant(userId, professionalMembershipId, scopes);
  }
}

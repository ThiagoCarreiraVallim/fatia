import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PlanOfferService } from '../plan-offer.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class DeclinePlanOfferTool implements McpToolDef {
  constructor(private readonly offers: PlanOfferService) {}
  readonly name = 'decline_plan_offer';
  readonly title = 'Recusar o plano de treino da equipe';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Recusa a versão de um plano de treino que a equipe enviou. Numa atualização de plano já ' +
    'aceito, é manter a versão atual: o plano do usuário não muda. A equipe é avisada; o vínculo ' +
    'e o que o usuário compartilha com ela não mudam. Dá para voltar atrás com accept_plan_offer ' +
    'enquanto não chegar versão nova. ' +
    'Exemplo: {"offerId":"11111111-2222-4333-8444-555555555555","versionId":"66666666-7777-4888-9999-000000000000"}';
  readonly inputSchema = {
    offerId: z.string().uuid().describe('ID da oferta (id em list_plan_offers)'),
    versionId: z.string().uuid().describe('ID da versão mostrada (shown.id)'),
  } as const;
  execute(input: { offerId: string; versionId: string }, { userId }: McpToolContext) {
    return this.offers.decline(userId, input.offerId, input.versionId);
  }
}

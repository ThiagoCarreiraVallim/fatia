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
export class AcceptPlanOfferTool implements McpToolDef {
  constructor(private readonly offers: PlanOfferService) {}
  readonly name = 'accept_plan_offer';
  readonly title = 'Aceitar o plano de treino da equipe';
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: true };
  readonly hostedInference = false;
  readonly card = 'confirm' as const;
  readonly description =
    'Aceita a versão de um plano de treino que a equipe enviou (list_plan_offers). A primeira ' +
    'versão cria o plano nos planos do usuário; a de uma atualização troca os exercícios do mesmo ' +
    'plano. Plano de calendário põe as sessões na agenda de hoje em diante. A equipe é avisada. ' +
    'Confirme com o usuário antes, mostrando o que muda. ' +
    'Exemplo: {"offerId":"11111111-2222-4333-8444-555555555555","versionId":"66666666-7777-4888-9999-000000000000"}';
  readonly inputSchema = {
    offerId: z.string().uuid().describe('ID da oferta (id em list_plan_offers)'),
    versionId: z.string().uuid().describe('ID da versão mostrada (shown.id)'),
  } as const;
  execute(input: { offerId: string; versionId: string }, { userId, timezone }: McpToolContext) {
    return this.offers.accept(userId, input.offerId, input.versionId, timezone);
  }
}

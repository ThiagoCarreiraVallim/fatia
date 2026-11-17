import { Injectable } from '@nestjs/common';
import { PlanOfferService } from '../plan-offer.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListPlanOffersTool implements McpToolDef {
  constructor(private readonly offers: PlanOfferService) {}
  readonly name = 'list_plan_offers';
  readonly title = 'Planos de treino recebidos da equipe';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'list' as const;
  readonly description =
    'Lista os planos de treino que a equipe da comunidade enviou ao usuário. Em pending vêm os que ' +
    'esperam resposta, cada um com os exercícios, a agenda (CALENDAR com datas ou FLEXIBLE sem ' +
    'datas), o recado e, quando é atualização de um plano já aceito (kind "update"), o que mudou ' +
    '(diff: exercícios novos, removidos e alterados). Em accepted, os que estão em uso. Para ' +
    'responder, use accept_plan_offer ou decline_plan_offer com shown.id como versionId.';
  readonly inputSchema = {} as const;
  async execute(_input: unknown, { userId }: McpToolContext) {
    const list = await this.offers.list(userId);
    return {
      pending: await Promise.all(list.pending.map((o) => this.offers.get(userId, o.id))),
      accepted: list.accepted,
    };
  }
}

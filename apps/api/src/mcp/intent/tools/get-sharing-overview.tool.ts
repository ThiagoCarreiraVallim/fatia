import { Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { ConsentService } from '../../../sharing/consent.service';
import { GroupService } from '../../../sharing/group.service';
import { IntentTool } from '../composicao';
import type { IntentInput } from '../intent-surface';

/** O default de janela da trilha, no contrato. */
const DIAS_PADRAO = 30;

/**
 * Grupos, consentimentos vigentes e a trilha de acesso, recortada à janela pedida. A trilha
 * é a página que o `list_data_access_log` devolve, do mais recente para trás.
 */
@Injectable()
@McpTool()
export class GetSharingOverviewTool extends IntentTool<'get_sharing_overview'> {
  constructor(
    private readonly groups: GroupService,
    private readonly consent: ConsentService,
  ) {
    super('get_sharing_overview');
  }

  async execute(input: IntentInput<'get_sharing_overview'>, { userId }: McpToolContext) {
    const [groups, sharing, log] = await Promise.all([
      this.groups.listMine(userId), // list_my_groups
      this.consent.listMine(userId), // list_data_sharing
      this.consent.listAccessLog(userId), // list_data_access_log
    ]);
    const dias = input.accessLogDays ?? DIAS_PADRAO;
    const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
    const accessLog = log.filter((linha) => linha.at.getTime() >= desde);
    return { groups, sharing, accessLogDays: dias, accessLog };
  }
}

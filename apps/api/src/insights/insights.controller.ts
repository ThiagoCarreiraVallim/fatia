import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { GroupRoleGuard } from '../sharing/guards/group-role.guard';
import { RequireGroupAction } from '../sharing/decorators/require-group-action.decorator';
import { AggregateQueryDto } from './dto/insights.dto';
import { InsightsExportService } from './insights-export.service';
import { InsightsService } from './insights.service';
import { InsightsAddonGuard } from './guards/insights-addon.guard';
import { cutsOf } from './cut-registry';

/**
 * Superfície do painel agregado do dono (#159 e #160).
 *
 * **Zero tool MCP.** O painel é do dono da academia, não do app do usuário: o
 * `docs/MCP_TOOL_SURFACE.md` não muda e o total de tools continua o mesmo. Uma
 * tool aqui daria a um assistente conversacional o poder de iterar recortes até
 * achar o que sobra pouca gente — exatamente o padrão que a #159 fecha.
 *
 * Note o que **não** existe nesta classe: nenhum `userId`, nenhum
 * `membershipId`, nenhuma rota que devolva linha de pessoa. O dono age no
 * agregado — campanha, horário, oferta — não em cima da Maria.
 *
 * `@RequireGroupAction('insights.read')` é `OWNER` e só (`docs/PERMISSIONS.md`):
 * o profissional já tem o caminho individual, com consentimento do aluno, e dar
 * a ele também o agregado seria dois caminhos para a mesma informação com regras
 * diferentes.
 */
@Controller('groups/:groupId/insights')
@UseGuards(GroupRoleGuard)
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly exporter: InsightsExportService,
  ) {}

  /** Os recortes que este grupo pode pedir no painel de retenção. */
  @Get('retention/cuts')
  @RequireGroupAction('insights.read')
  retentionCuts() {
    return { cuts: cutsOf('retention') };
  }

  @Get('retention')
  @RequireGroupAction('insights.read')
  retention(@Param('groupId') groupId: string, @Query() query: AggregateQueryDto) {
    return this.insights.aggregate(groupId, 'retention', query.cut, query.period);
  }

  @Get('behavior/cuts')
  @RequireGroupAction('insights.read')
  @UseGuards(InsightsAddonGuard)
  behaviorCuts() {
    return { cuts: cutsOf('behavior') };
  }

  @Get('behavior')
  @RequireGroupAction('insights.read')
  @UseGuards(InsightsAddonGuard)
  behavior(@Param('groupId') groupId: string, @Query() query: AggregateQueryDto) {
    return this.insights.aggregate(groupId, 'behavior', query.cut, query.period);
  }

  /**
   * Export do painel pago.
   *
   * Repare que ele chama **o mesmo** `aggregate` da tela e passa o resultado ao
   * serializador: não há segunda consulta, e por isso não há como o CSV conter
   * o que a tela suprimiu. O `InsightsExportService` sequer tem repositório para
   * fazer a segunda consulta.
   */
  @Get('behavior/export')
  @RequireGroupAction('insights.read')
  @UseGuards(InsightsAddonGuard)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="insights.csv"')
  async export(@Param('groupId') groupId: string, @Query() query: AggregateQueryDto) {
    const aggregate = await this.insights.aggregate(groupId, 'behavior', query.cut, query.period);
    return this.exporter.toCsv(aggregate);
  }
}

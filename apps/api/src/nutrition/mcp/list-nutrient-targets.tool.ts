import { Injectable } from '@nestjs/common';
import { NutrientTargetService } from '../nutrient-target.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { rangeCenter } from '../../mcp/card-format';

@Injectable()
@McpTool()
export class ListNutrientTargetsTool implements McpToolDef {
  constructor(private readonly targets: NutrientTargetService) {}
  readonly name = 'list_nutrient_targets';
  readonly title = 'Listar metas de nutrientes';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'range' as const;
  readonly description = 'Lista as metas de nutrientes personalizadas do usuário.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.targets.list(userId);
  }

  /**
   * As faixas cadastradas (prancha IA-Cartoes, #384). Sem consumo para marcar, o ponto fica no
   * meio da faixa — ou no único limite que houver.
   */
  artifact(result: unknown) {
    const metas = result as Awaited<ReturnType<NutrientTargetService['list']>>;
    return {
      kind: 'range',
      label: 'Metas de nutrientes',
      rows: metas.flatMap((m) => {
        const valor = rangeCenter(m.min, m.max);
        return valor == null
          ? []
          : [{ label: m.label, value: valor, min: m.min, max: m.max, unit: m.unit }];
      }),
    };
  }
}

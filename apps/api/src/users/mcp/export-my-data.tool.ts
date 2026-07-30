import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { AccountService } from '../account.service';

@Injectable()
@McpTool()
export class ExportMyDataTool implements McpToolDef {
  constructor(private readonly account: AccountService) {}

  readonly name = 'export_my_data';
  readonly description =
    'Exporta TODOS os dados do usuário em JSON: perfil, metas, refeições e itens, treinos e séries, peso, passos, hidratação, e os alimentos e exercícios custom que ele criou. Use quando o usuário pedir uma cópia dos seus dados, quiser levá-los para outro app, ou antes de apagar a conta. O retorno pode ser grande — resuma para o usuário em vez de despejar o JSON inteiro.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.account.exportData(userId);
  }
}

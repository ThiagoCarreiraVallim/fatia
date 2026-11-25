import { Injectable } from '@nestjs/common';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { DataExportService } from '../data-export.service';

@Injectable()
@McpTool()
export class ExportMyDataTool implements McpToolDef {
  constructor(private readonly exports: DataExportService) {}

  readonly name = 'export_my_data';

  readonly title = 'Exportar meus dados';

  // Cria um link que abre SEM login, com todos os dados da conta (conversas inclusive), e
  // por isso não é leitura: quem tem o link tem tudo. Fora do chat hospedado (#481), para que
  // a IA nunca ponha esse link no contexto do modelo nem num texto que ela proponha publicar.
  readonly annotations = { readOnlyHint: false, destructiveHint: false, confirmableHint: false };

  readonly hostedInference = false;
  readonly appOnly = { screen: 'Você', path: '/you' };
  readonly description =
    'Gera um link para baixar TODOS os dados do usuário em um arquivo JSON: perfil, metas, refeições e itens, treinos e séries, peso, passos, hidratação, conversas, comunidades e os alimentos e exercícios custom que ele criou. ' +
    'O link vale 24 horas (`expiresAt`) e abre sem login, então entregue-o só ao próprio usuário. Use quando ele pedir uma cópia dos dados, quiser levá-los para outro app, ou antes de apagar a conta.';
  readonly inputSchema = {} as const;

  execute(_input: Record<string, never>, { userId }: McpToolContext) {
    return this.exports.createLink(userId);
  }
}

import { Injectable } from '@nestjs/common';
import { AchievementService } from '../achievement.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class RefreshAchievementsTool implements McpToolDef {
  constructor(private readonly achievements: AchievementService) {}
  readonly name = 'refresh_achievements';
  readonly title = 'Desbloquear conquistas';
  // Escrita: cria as linhas de `UserAchievement` que passaram a valer. Fica fora do grupo de
  // leitura de propósito — era `get_today_summary` quem desbloqueava, e uma tool anotada como
  // `readOnlyHint: true` gravando é surpresa desagradável para quem lê a anotação.
  readonly annotations = { readOnlyHint: false, destructiveHint: false };
  readonly description =
    'Reavalia o catálogo de conquistas e desbloqueia as que o usuário já mereceu, devolvendo as ' +
    'sete chaves com `unlockedAt` atualizado. Idempotente: chamar de novo não duplica nada nem ' +
    'muda a data de quem já tinha. Use depois de registrar refeição, treino ou plano para saber ' +
    'se aquilo desbloqueou algo. Exemplo: {}';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    return this.achievements.evaluate({ userId, timezone });
  }
}

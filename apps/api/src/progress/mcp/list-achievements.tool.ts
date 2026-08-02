import { Injectable } from '@nestjs/common';
import { AchievementService } from '../achievement.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

@Injectable()
@McpTool()
export class ListAchievementsTool implements McpToolDef {
  constructor(private readonly achievements: AchievementService) {}
  readonly name = 'list_achievements';
  readonly title = 'Conquistas';
  readonly annotations = { readOnlyHint: true, destructiveHint: false };
  readonly description =
    'Catálogo de conquistas do usuário. Devolve as sete chaves sempre, cada uma com `unlockedAt` ' +
    '(ISO) quando já foi desbloqueada ou `null` quando ainda falta — inclusive as bloqueadas, ' +
    'para o Claude saber o que sugerir como próximo passo.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    // Só lê. O desbloqueio acontece em `get_today_summary`, que é o caminho que o app já usa —
    // uma tool de leitura que grava seria uma surpresa desagradável para quem lê `readOnlyHint`.
    return this.achievements.list({ userId, timezone });
  }
}

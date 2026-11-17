import { Injectable } from '@nestjs/common';
import { AchievementService, type AchievementEntry } from '../achievement.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';
import { achievementBadges } from './achievement-badges';

@Injectable()
@McpTool()
export class ListAchievementsTool implements McpToolDef {
  constructor(private readonly achievements: AchievementService) {}
  readonly name = 'list_achievements';
  readonly title = 'Conquistas';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  readonly hostedInference = false;
  readonly card = 'badges' as const;
  readonly description =
    'Catálogo de conquistas do usuário: as dez, sempre (primeira refeição, primeiro treino, ' +
    'primeiro plano, primeiro recorde, 7 e 30 dias seguidos, meta da semana, 100 treinos, ' +
    'primeiro desafio e desafio no pódio). Cada uma com `unlockedAt` (ISO) quando já foi ' +
    'desbloqueada ou `null` quando ainda falta, `context` do desbloqueio, `condition` (o que ' +
    'falta) e, nas bloqueadas de contagem, `progress` ({ current, target }) — para o Claude ' +
    'saber o que sugerir como próximo passo.';
  readonly inputSchema = {} as const;
  execute(_input: Record<string, never>, { userId, timezone }: McpToolContext) {
    // Só lê. Quem desbloqueia é `refresh_achievements`, que se declara escrita — uma tool de
    // leitura que grava seria uma surpresa desagradável para quem lê `readOnlyHint`.
    return this.achievements.list({ userId, timezone }, { withProgress: true });
  }

  /** Os selos, com quantos já saíram (prancha IA-Cartoes, #384). */
  artifact(result: unknown) {
    return achievementBadges(result as AchievementEntry[]);
  }
}

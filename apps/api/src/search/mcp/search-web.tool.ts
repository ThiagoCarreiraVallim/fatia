import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiAccessService } from '../../ai/ai-access.service';
import { AiUsageService } from '../../ai/ai-usage.service';
import { BraveSearchService } from '../brave-search.service';
import {
  McpTool,
  type McpToolContext,
  type McpToolDef,
} from '../../common/decorators/tool.decorator';

/** O nome do buscador no `AI_PRICE_TABLE`: o preço de uma consulta, em `in`. */
export const BRAVE_SEARCH_MODEL = 'brave-search';
export const WEB_SEARCH_FEATURE = 'web_search';

/**
 * A busca na web do chat hospedado (backup de agosto, 48cb4a4).
 *
 * As outras tools leem ou escrevem o que é da pessoa; esta sai para fora e traz
 * o que ninguém aqui tem — rótulo de produto fora da TACO, estudo recente,
 * cardápio de rede.
 *
 * **Só o agente da Fatia a recebe** (`agentOnly`). O Claude ou o ChatGPT de quem
 * conecta o `/mcp` já buscam na web por conta própria, e servir a tool a eles
 * seria a Fatia pagar uma busca que o cliente faz de graça.
 *
 * **Quem paga é a pessoa**, pela cota de IA (ADR 024): cada consulta exige o
 * plano e cota livre antes de sair, e entra em `AiUsage` depois. A conferência
 * é por chamada, e não só no começo do turno, porque um turno pode buscar várias
 * vezes.
 *
 * Nada da pessoa viaja ao Brave: o `userId` só serve à cota, aqui dentro.
 */
@Injectable()
@McpTool()
export class SearchWebTool implements McpToolDef {
  constructor(
    private readonly brave: BraveSearchService,
    private readonly acesso: AiAccessService,
    private readonly uso: AiUsageService,
  ) {}

  readonly name = 'search_web';
  readonly title = 'Buscar na web';
  readonly annotations = { readOnlyHint: true, destructiveHint: false, confirmableHint: false };
  /**
   * `true`: cada chamada é uma consulta paga. O campo protege "chamada MCP que
   * custa dinheiro sem sintoma até a fatura" — e é por isso que a tool é
   * `agentOnly` e cobra da cota. A exceção está registrada na lista do
   * `tool-catalog.spec.ts`.
   */
  readonly hostedInference = true;
  readonly agentOnly = true as const;
  readonly description =
    'Busca na web por informação que não está no app: rótulo de produto fora da TACO, ' +
    'estudo recente, cardápio de rede. Devolve título, URL, trecho e a data da página ' +
    'quando ela é conhecida. Use os dados do próprio usuário pelas outras tools — esta ' +
    'não alcança nada da conta dele.';
  readonly inputSchema = {
    query: z
      .string()
      .min(2)
      .max(300)
      .describe('O que pesquisar, em linguagem natural (ex.: "calorias do Big Mac")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Quantos resultados trazer (default 5, máx 10)'),
  } as const;

  async execute(params: { query: string; limit?: number }, ctx: McpToolContext) {
    // Antes de gastar: sem plano ou sem cota, a busca nem sai.
    const direito = await this.acesso.assertPodeUsar(ctx.userId);
    const results = await this.brave.buscar(params.query, params.limit ?? 5);
    // Só a consulta que deu certo entra na conta: a que falhou o Brave não cobra.
    await this.uso.record(ctx.userId, {
      feature: WEB_SEARCH_FEATURE,
      model: BRAVE_SEARCH_MODEL,
      units: { inputUnits: 1, outputUnits: 0 },
      ...AiAccessService.pagoPor(direito),
    });
    // A consulta volta junto do resultado: é o que permite ao modelo citar o que
    // de fato foi perguntado ao buscador, e não o que ele achou que perguntou.
    return { query: params.query, results };
  }
}

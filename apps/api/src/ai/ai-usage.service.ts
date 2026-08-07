import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { estimateAiCost, type AiCallUnits, type AiPriceTable } from './ai-pricing';
import { assertAiQuota, utcQuotaWindow, type AiQuotaLimits, type AiQuotaSpend } from './ai-quota';

/**
 * A metade com I/O da cota da #135: soma a janela, decide, e grava o que gastou.
 *
 * A decisão em si continua em `ai-quota.ts`, que é puro e já tem teste próprio.
 * O que faltava era a **fonte do gasto** — a #135 entregou a matemática e nenhum
 * lugar de onde tirar `AiQuotaSpend`, ausência que
 * `nutrition/inference-throttler.guard.ts` registra com todas as letras ("não há
 * `AiUsage` para cobrar depois"). É essa lacuna que a tabela `AiUsage` e este
 * serviço fecham, para que a #249 **reuse** a cota em vez de inventar a segunda.
 *
 * Fica em `ai/` e não em `chat/` de propósito: o chat é o primeiro a gastar, não
 * o único. Quando a #139 (visão) passar a registrar, ela grava aqui e o teto do
 * dia continua sendo um só.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Barra a chamada **antes** de ela acontecer, ou não faz nada.
   *
   * Lança `AiQuotaExceededException` (429 com `AI_QUOTA_EXCEEDED`). Quem chama
   * não trata: a mensagem já manda a pessoa para o caminho manual, que continua
   * inteiro.
   */
  async assertDentroDaCota(userId: string, agora: Date = new Date()): Promise<void> {
    assertAiQuota(await this.gastoDaJanela(userId, agora), this.limites(), agora);
  }

  /**
   * Gasto da janela UTC corrente: o do usuário, o da instância, e quantas
   * chamadas não deu para medir.
   *
   * As três consultas rodam sempre, inclusive quando nenhuma cota está ligada.
   * A tentação é pular o banco nesse caso, e ela custa caro: seria uma segunda
   * cópia da regra "quando a cota vale" (`decideAiQuota`), num lugar onde
   * divergir dela não produz teste vermelho — ela simplesmente liberaria tudo.
   * Três `SUM`/`COUNT` sobre índice, ao lado de uma inferência de vários
   * segundos, não são o custo que vale essa troca.
   */
  async gastoDaJanela(userId: string, agora: Date = new Date()): Promise<AiQuotaSpend> {
    const { start } = utcQuotaWindow(agora);

    const [doUsuario, daInstancia, semPreco] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        _sum: { costMicros: true },
        where: { userId, createdAt: { gte: start } },
      }),
      this.prisma.aiUsage.aggregate({
        _sum: { costMicros: true },
        where: { createdAt: { gte: start } },
      }),
      // Contagem **da instância**, não do usuário: o que esta guarda protege é a
      // capacidade de medir, e a tabela de preço é uma só para todo mundo. Por
      // usuário, cada conta nova ganharia a tolerância inteira de novo, e a
      // medição quebrada nunca chegaria ao limite que a desliga.
      this.prisma.aiUsage.count({ where: { createdAt: { gte: start }, pricingKnown: false } }),
    ]);

    return {
      userMicros: doUsuario._sum.costMicros ?? 0,
      globalMicros: daInstancia._sum.costMicros ?? 0,
      unpricedCalls: semPreco,
    };
  }

  /**
   * Grava o que a chamada custou. **Sempre**, inclusive quando o modelo não
   * reportou nada.
   *
   * Sem `model`, `estimateAiCost` devolve `pricingKnown: false` e custo `0` — e é
   * assim que tem de ser. O `0` não quer dizer "foi de graça": quer dizer "não
   * medimos", e é `unpricedCalls` que impede esse `0` de virar cota infinita.
   * Aqui está o encaixe com o `apps/agent`: se ele parar de emitir `usage`, a
   * cota fecha pela tolerância em vez de liberar para sempre em silêncio.
   */
  async registrar(
    userId: string,
    entrada: { feature: string; model: string | null; units: AiCallUnits },
  ): Promise<void> {
    const custo = entrada.model
      ? estimateAiCost(entrada.model, entrada.units, this.tabelaDePreco())
      : { costMicros: 0, pricingKnown: false };

    await this.prisma.aiUsage.create({
      data: {
        userId,
        feature: entrada.feature,
        model: entrada.model ?? '',
        costMicros: custo.costMicros,
        pricingKnown: custo.pricingKnown,
      },
    });
  }

  private limites(): AiQuotaLimits {
    return {
      userDailyMicros: this.config.get<number>('AI_QUOTA_DAILY_MICROS', 0),
      globalDailyMicros: this.config.get<number>('AI_QUOTA_GLOBAL_DAILY_MICROS', 0),
      unpricedDailyCalls: this.config.get<number>('AI_QUOTA_UNPRICED_DAILY_CALLS', 20),
    };
  }

  /** Já vem parseada do `AppEnvSchema` — o `JSON.parse` acontece no boot, não aqui. */
  private tabelaDePreco(): AiPriceTable {
    return this.config.get<AiPriceTable>('AI_PRICE_TABLE', {});
  }
}

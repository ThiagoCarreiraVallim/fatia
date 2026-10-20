import { Injectable, Logger } from '@nestjs/common';
import { AiAccessService, type Pagador } from './ai-access.service';
import { AiUsageService } from './ai-usage.service';
import type { AiCallUnits } from './ai-pricing';
import {
  AgentAdapter,
  type AgentCapabilities,
  type AgentMealRecognition,
  type AgentStream,
  type AgentUsage,
  type TurnInput,
} from './agent.adapter';

/** O que vai em `AiUsage.feature`. */
type AiFeature = 'chat' | 'chat_title' | 'transcription' | 'meal_photo';

/**
 * A IA hospedada, num lugar só: **portão de plano e cota → quem paga → agente →
 * uso gravado**, nesta ordem, em todo método que gasta inferência.
 *
 * Antes cada ponto de uso (turno, ditado e título no `ChatService`, foto no
 * `MealRecognitionService`) repetia a sequência à mão, e um teste por regex era
 * o que lembrava a próxima rota de passar pelo portão. Agora o `AgentAdapter` só
 * é injetável aqui dentro (o `AiModule` não o exporta): quem quer IA pede a este
 * serviço, e o portão e o livro-caixa vêm junto.
 *
 * **Gravar o uso nunca lança.** A resposta já foi paga quando a gravação
 * acontece; derrubar a resposta por causa do livro-caixa seria cobrar sem
 * entregar. A falha fica no log, sem conteúdo.
 */
@Injectable()
export class HostedAiService {
  private readonly logger = new Logger(HostedAiService.name);

  constructor(
    private readonly access: AiAccessService,
    private readonly usage: AiUsageService,
    private readonly agent: AgentAdapter,
  ) {}

  /** `true` quando esta instância tem agente configurado. */
  configured(): boolean {
    return this.agent.configured();
  }

  /** Foto e ditado disponíveis nesta instância. Nunca lança. */
  capabilities(): Promise<AgentCapabilities> {
    return this.agent.capabilities();
  }

  /** O voto vai ao trace do turno. Não é inferência: sem portão e sem custo. */
  sendFeedback(runId: string, review: 'like' | 'dislike' | null, reasons: string[]) {
    return this.agent.sendFeedback(runId, review, reasons);
  }

  /**
   * Abre um turno de chat. O portão roda antes de `buildInput`, que recebe a
   * comunidade do assento (o agente padrão da conversa, Fase 7c).
   *
   * O uso do turno só é conhecido no fim do stream: quem abriu chama
   * `HostedTurn.finish` com o que leu, inclusive quando o stream quebrou.
   */
  async openTurn(
    userId: string,
    buildInput: (seatGroupId: string | null) => Promise<TurnInput>,
  ): Promise<HostedTurn> {
    const payer = await this.gate(userId);
    const stream = await this.agent.openTurn(await buildInput(payer.groupId));
    return new HostedTurn(
      stream,
      (feature, model, units) => this.record(userId, payer, feature, model, units),
      (text) => this.titleFor(userId, payer, text),
    );
  }

  /**
   * O ditado do composer (#141). O texto volta para o campo de mensagem e não
   * vira turno: quem decide mandar é a pessoa, depois de ler.
   */
  async transcribe(userId: string, audio: Buffer, contentType: string): Promise<{ text: string }> {
    const payer = await this.gate(userId);
    const { text, usage } = await this.agent.transcribe(audio, contentType);
    // Transcrição não tem saída cobrada: `0`, e não `undefined` — ver `AiCallUnits`.
    await this.record(userId, payer, 'transcription', usage?.model ?? null, {
      inputUnits: usage?.inputUnits,
      outputUnits: 0,
    });
    return { text };
  }

  /** Foto JPEG já sem metadados → alimentos candidatos. Não grava refeição. */
  async recognizeMeal(userId: string, jpeg: Buffer): Promise<Omit<AgentMealRecognition, 'usage'>> {
    const payer = await this.gate(userId);
    const { items, note, usage } = await this.agent.recognizeMeal(jpeg);
    await this.record(userId, payer, 'meal_photo', ...modelAndUnits(usage));
    return { items, note };
  }

  /**
   * O nome da conversa. **Herda o direito do turno que a abriu**, em vez de passar
   * pelo portão de novo: só existe pela `HostedTurn`, que só existe depois do
   * portão. Conferir a cota outra vez trocaria três consultas por um título que,
   * barrado, deixaria a conversa com o recorte da primeira mensagem — e o custo é
   * gravado do mesmo jeito, com o mesmo pagador do turno.
   */
  private async titleFor(userId: string, payer: Pagador, text: string): Promise<string | null> {
    const generated = await this.agent.title(text);
    if (!generated) return null;
    await this.record(userId, payer, 'chat_title', ...modelAndUnits(generated.usage));
    return generated.title;
  }

  /** Plano antes de cota (ADR 024), e quem paga (ADR 025). */
  private async gate(userId: string): Promise<Pagador> {
    return AiAccessService.pagoPor(await this.access.assertPodeUsar(userId));
  }

  private async record(
    userId: string,
    payer: Pagador,
    feature: AiFeature,
    model: string | null,
    units: AiCallUnits,
  ): Promise<void> {
    try {
      await this.usage.record(userId, { feature, ...payer, model, units });
    } catch (error) {
      this.logger.error(`Uso de IA não gravado (${feature}): ${(error as Error).name}`);
    }
  }
}

/** Um turno aberto: o stream do agente e o que só ele pode fazer depois do portão. */
export class HostedTurn {
  constructor(
    readonly stream: AgentStream,
    private readonly recordUsage: (
      feature: AiFeature,
      model: string | null,
      units: AiCallUnits,
    ) => Promise<void>,
    private readonly generateTitle: (text: string) => Promise<string | null>,
  ) {}

  /**
   * Grava o consumo do turno, um lançamento por modelo. Nunca lança.
   *
   * Turno sem nenhum `usage` vira um lançamento **não medido**, e não nenhum:
   * um turno caro não pode entrar como grátis.
   */
  async finish(usageByModel: ReadonlyMap<string, AiCallUnits>): Promise<void> {
    if (usageByModel.size === 0) {
      await this.recordUsage('chat', null, {});
      return;
    }
    for (const [model, units] of usageByModel) await this.recordUsage('chat', model, units);
  }

  /** O nome da conversa nova, com o custo no livro-caixa. `null` em qualquer falha. */
  title(text: string): Promise<string | null> {
    return this.generateTitle(text);
  }
}

/** `usage` das rotas auxiliares → o que `AiUsageService.record` espera. */
function modelAndUnits(usage: AgentUsage | null): [string | null, AiCallUnits] {
  if (!usage) return [null, {}];
  return [usage.model, { inputUnits: usage.inputUnits, outputUnits: usage.outputUnits }];
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { BehaviorService } from './behavior.service';
import { EngagementService } from './engagement.service';
import { RetentionService } from './retention.service';
import { StatsParticipation, type Participant } from './stats-participation.port';
import {
  MIN_CELL,
  insufficientSample,
  suppress,
  type Aggregate,
  type Cell,
} from './aggregation.service';
import {
  cutBelongsTo,
  periodDays,
  periodStart,
  type CutName,
  type Panel,
  type PeriodName,
} from './cut-registry';

export interface AggregateResponse extends Aggregate {
  cut: CutName;
  period: PeriodName;
}

/**
 * O **único** caminho de agregação do produto.
 *
 * Alertas de retenção (#159) e painel pago (#160) entram os dois por aqui:
 * mesmo consentimento, mesmo limiar, mesmo `suppress()`. É o que a seção
 * "Ordem" da #160 exige — construir os dois em paralelo produziria duas noções
 * de anonimização no mesmo produto. `single-aggregation-path.spec.ts` transforma
 * isso em invariante estrutural: este é o único arquivo de produção que importa
 * `suppress`.
 *
 * A ordem das três checagens importa e não é intercambiável:
 *
 * 1. **O recorte pertence ao painel pedido?** Antes de qualquer leitura — senão
 *    o painel gratuito serviria recorte pago só por saber o nome dele.
 * 2. **Quem consentiu?** O denominador é só de quem deu opt-in. Misturar
 *    denominador cheio com numerador consentido vaza informação sobre quem
 *    recusou.
 * 3. **A amostra dá?** Grupo com menos de `MIN_CELL` participantes não chega a
 *    consultar o banco: nenhuma célula poderia passar, e números que serão
 *    jogados fora ainda assim passeariam por logs e métricas no caminho.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly participation: StatsParticipation,
    private readonly engagement: EngagementService,
    private readonly retention: RetentionService,
    private readonly behavior: BehaviorService,
  ) {}

  async aggregate(
    groupId: string,
    panel: Panel,
    cut: CutName,
    period: PeriodName,
    now: Date = new Date(),
  ): Promise<AggregateResponse> {
    // `NOT_FOUND`, e não `BAD_REQUEST`: pedir ao painel gratuito um recorte que
    // só existe no pago não deve confirmar que ele existe.
    if (!cutBelongsTo(cut, panel)) throw new NotFoundException('Recorte não encontrado');

    const participants = await this.participation.participants(groupId);
    if (participants.length < MIN_CELL) {
      return { cut, period, ...insufficientSample() };
    }

    const cells = await this.cells(cut, participants, period, now);
    return { cut, period, ...suppress(cells) };
  }

  /**
   * Despacho do recorte para quem conta. O `switch` é exaustivo por tipo: um
   * recorte novo no `CUTS` sem linha aqui não compila, e é assim que "endpoint
   * só para este relatório" deixa de ser um caminho possível.
   *
   * **Todo** recorte recebe a janela. Três deles a ignoravam e mesmo assim a
   * resposta e o CSV carimbavam o período pedido — `last_30_days` e
   * `last_12_months` devolviam células idênticas com rótulos diferentes.
   */
  private async cells(
    cut: CutName,
    participants: readonly Participant[],
    period: PeriodName,
    now: Date,
  ): Promise<Cell[]> {
    const start = periodStart(period, now);

    switch (cut) {
      case 'sessions_by_week':
        return this.engagement.sessionsByWeek(participants, start, now);
      case 'active_days_by_month':
        return this.engagement.activeDaysByMonth(participants, start, now);
      case 'sessions_by_hour_band':
        return this.engagement.sessionsByHourBand(participants, start);
      case 'members_by_recency':
        return this.engagement.membersByRecency(participants, start, now);
      case 'members_by_churn_risk':
        return this.retention.membersByChurnRisk(participants, periodDays(period, now), now);
      case 'plan_adherence_by_month':
        return this.behavior.planAdherenceByMonth(participants, start, now);
      case 'retention_by_cohort':
        return this.behavior.retentionByCohort(participants, start, now);
      case 'modality_mix':
        return this.behavior.modalityMix(participants, start);
    }
  }
}

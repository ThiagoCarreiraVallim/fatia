import { BadRequestException, Injectable } from '@nestjs/common';
import { McpTool, type McpToolContext } from '../../../common/decorators/tool.decorator';
import { StepLogService } from '../../../progress/step-log.service';
import { WaterLogService } from '../../../progress/water-log.service';
import { WeightLogService } from '../../../progress/weight-log.service';
import { todayInTz } from '../../../progress/helpers/date-tz';
import { IntentTool, meioDiaDe, resolverDia } from '../composicao';
import type { IntentInput } from '../intent-surface';

/**
 * Um `kind`, uma perna: `log_water`, `log_steps` ou `log_weight`, cada uma com a resposta
 * que ela mesma dá. Água e passos são inteiros nas pernas, e o valor quebrado é recusado em
 * vez de arredondado. O peso de outro dia vai ao meio-dia dele: `log_weight` pede um
 * instante, e "ontem" não tem hora.
 */
@Injectable()
@McpTool()
export class RecordMeasurementTool extends IntentTool<'record_measurement'> {
  constructor(
    private readonly waters: WaterLogService,
    private readonly steps: StepLogService,
    private readonly weights: WeightLogService,
  ) {
    super('record_measurement');
  }

  async execute(input: IntentInput<'record_measurement'>, { userId, timezone }: McpToolContext) {
    const date = resolverDia(input.day, timezone);
    if (input.kind !== 'weight_kg' && !Number.isInteger(input.value)) {
      throw new BadRequestException(`${input.kind} é um número inteiro; recebeu ${input.value}.`);
    }
    switch (input.kind) {
      case 'water_ml':
        return this.waters.logWithDayTotal(
          { ml: input.value, date, notes: input.notes },
          userId,
          timezone,
        ); // log_water
      case 'steps':
        return this.steps.logWithDayTotal(
          { steps: input.value, date, notes: input.notes },
          userId,
          timezone,
        ); // log_steps
      case 'weight_kg':
        return this.weights.log(
          {
            weightKg: input.value,
            ...(date !== todayInTz(timezone) && { loggedAt: meioDiaDe(date, timezone) }),
            notes: input.notes,
          },
          userId,
        ); // log_weight
    }
  }
}

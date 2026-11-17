import { IsIn, IsOptional } from 'class-validator';
import { CONSISTENCY_RANGES, type ConsistencyRange } from '../helpers/consistency';

export class ConsistencyQueryDto {
  /** `month` (30 dias), `quarter` (90) ou `year` (365). Padrão: `month`. */
  @IsOptional()
  @IsIn(CONSISTENCY_RANGES)
  range?: ConsistencyRange;
}

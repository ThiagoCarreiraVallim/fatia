import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OVERVIEW_DAYS, SEARCH_QUERY_MAX, type OverviewDays } from '../panel.service';

export class OverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(OVERVIEW_DAYS)
  days?: OverviewDays;
}

export class PanelSearchQueryDto {
  @IsString()
  @MaxLength(SEARCH_QUERY_MAX)
  q!: string;
}

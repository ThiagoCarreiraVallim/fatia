import { IsOptional, IsString, Matches } from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** A agenda de um intervalo (#379). Sem datas: a semana atual, segunda a domingo. */
export class AgendaQueryDto {
  @IsOptional() @IsString() @Matches(DIA, { message: 'from deve ser YYYY-MM-DD' }) from?: string;
  @IsOptional() @IsString() @Matches(DIA, { message: 'to deve ser YYYY-MM-DD' }) to?: string;
}

/** "Remarcar": o dia novo, de hoje até o fim do plano. */
export class RescheduleSessionDto {
  @IsString() @Matches(DIA, { message: 'date deve ser YYYY-MM-DD' }) date!: string;
}

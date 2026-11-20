import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ASSENTOS_MAX } from '../seat-pricing';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Programa (#403): PRO por período para uma turma ou um desafio. */
export class CreateProgramDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;

  @IsIn(['CLASS', 'CHALLENGE'])
  kind!: 'CLASS' | 'CHALLENGE';

  @IsInt()
  @Min(1)
  @Max(ASSENTOS_MAX)
  seats!: number;

  @Matches(DIA, { message: 'startDate deve ser AAAA-MM-DD' })
  startDate!: string;

  @Matches(DIA, { message: 'endDate deve ser AAAA-MM-DD' })
  endDate!: string;

  /** Turma: quem ganha o assento (memberships da comunidade da URL). */
  @ValidateIf((o: CreateProgramDto) => o.kind === 'CLASS')
  @IsArray()
  @ArrayMaxSize(ASSENTOS_MAX)
  @IsUUID('all', { each: true })
  membershipIds?: string[];

  /** Desafio da comunidade da URL. */
  @ValidateIf((o: CreateProgramDto) => o.kind === 'CHALLENGE')
  @IsUUID()
  challengeId?: string;
}

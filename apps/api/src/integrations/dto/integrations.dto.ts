import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiKeyScope } from '@fatia/db';
import { PAGE_MAX } from '../integration-read.service';

/** Criar chave (#413): o nome que a dona reconhece ("Zapier") e, se quiser, menos acessos. */
export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(ApiKeyScope).length)
  @IsEnum(ApiKeyScope, { each: true })
  scopes?: ApiKeyScope[];
}

/** `?since=2026-11-01T00:00:00Z&limit=50`, o que o "poll" do Zapier e do Make manda. */
export class PageQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  since?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX)
  limit?: number;
}

export class InvitesQueryDto extends PageQueryDto {
  /** Só a Ativação pendente: por e-mail, sem aceite há 2 dias ou mais. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  pending?: boolean;
}

export const API_SEND_KINDS = ['WORKOUT_PLAN', 'PROGRAM_SALE'] as const;

export class SendsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(API_SEND_KINDS)
  kind?: (typeof API_SEND_KINDS)[number];
}

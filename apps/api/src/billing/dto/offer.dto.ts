import {
  IsBoolean,
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

const DIA = /^\d{4}-\d{2}-\d{2}$/;
/** R$ 10.000,00: teto de sanidade por oferta. */
const PRECO_MAX = 1_000_000;

/** Campos de uma oferta (#403, Pn-37). Nulo apaga o campo opcional. */
export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(600)
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(PRECO_MAX)
  priceCents?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  spots?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DIA, { message: 'startDate deve ser AAAA-MM-DD' })
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DIA, { message: 'endDate deve ser AAAA-MM-DD' })
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  grantsEntry?: boolean;

  /** Programa da comunidade da URL. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  programId?: string | null;

  /** Modelo de plano da comunidade da URL. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  planTemplateId?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  extras?: string | null;
}

export class CreateOfferDto extends UpdateOfferDto {
  @IsString()
  @MaxLength(80)
  declare title: string;

  @IsInt()
  @Min(100)
  @Max(PRECO_MAX)
  declare priceCents: number;
}

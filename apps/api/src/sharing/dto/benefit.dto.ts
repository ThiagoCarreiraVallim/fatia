import { PartnerBenefitKind } from '@fatia/db';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Benefício de parceiro (#393). A combinação cupom × link é conferida no service. */
export class CreateBenefitDto {
  @IsString() @MinLength(1) @MaxLength(60) partnerName!: string;
  @IsString() @MinLength(1) @MaxLength(80) discountText!: string;
  @IsEnum(PartnerBenefitKind) kind!: PartnerBenefitKind;
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string | null;
  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) validUntil!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() logoFileId?: string | null;
}

export class UpdateBenefitDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) partnerName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) discountText?: string;
  @IsOptional() @IsEnum(PartnerBenefitKind) kind?: PartnerBenefitKind;
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string | null;
  @IsOptional() @IsString() @MaxLength(500) url?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validUntil?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() logoFileId?: string | null;
}

export class BenefitParamDto {
  @IsUUID() groupId!: string;
  @IsUUID() benefitId!: string;
}

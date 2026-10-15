import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { ASSENTOS_MAX } from '../seat-pricing';

export class SeatCheckoutDto {
  @IsInt()
  @Min(1)
  @Max(ASSENTOS_MAX)
  seats!: number;

  /** CPF ou CNPJ de quem paga, com ou sem máscara. Validado no service; nunca gravado. */
  @IsString()
  @MaxLength(20)
  taxId!: string;
}

export class ChangeSeatsDto {
  @IsInt()
  @Min(1)
  @Max(ASSENTOS_MAX)
  seats!: number;
}

export class SeatMembershipParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  membershipId!: string;
}

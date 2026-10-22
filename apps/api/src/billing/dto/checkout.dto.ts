import { IsIn, IsString, MaxLength } from 'class-validator';

export class CheckoutDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  interval!: 'MONTHLY' | 'YEARLY';

  /** Com ou sem máscara. Validado pelos dígitos no service; nunca gravado. */
  @IsString()
  @MaxLength(20)
  cpf!: string;
}

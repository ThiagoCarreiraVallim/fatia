import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckoutDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  interval!: 'MONTHLY' | 'YEARLY';

  /** Com ou sem máscara. Validado pelos dígitos no service; nunca gravado. */
  @IsString()
  @MaxLength(20)
  cpf!: string;

  /** Pix, boleto ou cartão. Sem ela, a pessoa escolhe na página do Asaas. */
  @IsOptional()
  @IsIn(['PIX', 'BOLETO', 'CREDIT_CARD'])
  paymentMethod?: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
}

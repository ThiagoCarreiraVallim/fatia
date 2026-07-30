import { IsString } from 'class-validator';

export class DeleteAccountDto {
  /**
   * Confirmação textual obrigatória. Ver `DELETE_CONFIRMATION` em
   * `account.service.ts` — a validação do valor exato vive lá, junto da regra.
   */
  @IsString()
  confirmation!: string;
}

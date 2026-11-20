import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** O ID token que o app recebeu no login (ADR 050). */
export class SyncIdentityDto {
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  idToken!: string;
}

export class RequestEmailChangeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** A senha atual, conferida no Logto. Nunca é gravada nem registrada. */
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class ConfirmEmailChangeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^\s*\d{4,8}\s*$/)
  code!: string;
}

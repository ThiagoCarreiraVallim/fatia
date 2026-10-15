import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ShareScope } from '@prisma/client';

export class GrantConsentDto {
  /**
   * A associação **do profissional** no grupo — nunca o `userId` dele.
   * Identidade de usuário não entra por input em lugar nenhum do produto, e o
   * grupo sai desta mesma linha em vez de vir por fora (#204).
   */
  @IsUUID()
  professionalMembershipId!: string;

  /**
   * Categorias consentidas. Lista **vazia é válida** e significa "nada" —
   * equivale a revogar. Enum fechado: escopo desconhecido é `400` na borda, e
   * não uma linha gravada que nenhuma leitura jamais casaria.
   *
   * O teto existe porque o enum é finito: um array com dez mil repetições do
   * mesmo escopo é sempre erro de cliente, e normalizar depois de aceitar seria
   * trabalho à toa sobre entrada que ninguém deveria mandar.
   */
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  scopes!: ShareScope[];
}

export class AccessLogQueryDto {
  /**
   * `@Type` porque query string chega como texto e o `ValidationPipe` global
   * não converte sozinho — sem isto `@IsInt` reprovaria todo valor enviado.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Só as leituras feitas por vínculo desta comunidade. */
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

/**
 * O que compartilhar com a equipe da comunidade (ADR 026). Nada vem marcado:
 * a lista vazia e o `false` são o padrão, e recusar tudo ainda entra.
 */
export class GroupConsentDto {
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  scopes!: ShareScope[];

  @IsBoolean()
  statsOptIn!: boolean;
}

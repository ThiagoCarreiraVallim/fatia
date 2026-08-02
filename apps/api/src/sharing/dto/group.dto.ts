import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { GroupRole, GroupType } from '@prisma/client';

/**
 * Papéis que o dono pode conceder ao aprovar uma entrada.
 *
 * `OWNER` fica de fora: dono é quem criou o grupo, e transferir a propriedade é
 * operação separada, com confirmação. Fechar a lista aqui é o que impede a
 * aprovação de virar caminho de promoção acidental.
 */
export const PAPEIS_CONCEDIVEIS = [
  GroupRole.MEMBER,
  GroupRole.PROFESSIONAL,
  GroupRole.CREATOR,
] as const;

export class CreateGroupDto {
  @IsEnum(GroupType)
  type!: GroupType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  // Vai na URL do painel e no link de entrada — por isso o formato é fechado.
  // Ausente, o service deriva do nome com sufixo aleatório.
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug deve conter apenas letras minúsculas, números e hífen',
  })
  slug?: string;
}

export class JoinGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  slug!: string;
}

/**
 * Slug do preview, em DTO e não em `@Query('slug')` solto.
 *
 * O `ValidationPipe` global não valida primitivo avulso: sem esta classe o
 * `slug` chegava `undefined` no `findUnique`, o Prisma levantava
 * `PrismaClientValidationError` e — não havendo `ExceptionFilter` global — a
 * chamada sem query string virava **500** em vez de 400.
 */
export class PreviewGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  slug!: string;
}

export class ApproveMemberDto {
  @IsOptional()
  @IsIn(PAPEIS_CONCEDIVEIS as readonly string[])
  role?: (typeof PAPEIS_CONCEDIVEIS)[number];
}

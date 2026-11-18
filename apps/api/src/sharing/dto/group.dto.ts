import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  GroupRole,
  GroupType,
  GroupVisibility,
  JoinPolicy,
  PostPolicy,
  ShareScope,
} from '@prisma/client';

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

  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(JoinPolicy) joinPolicy?: JoinPolicy;
  @IsOptional() @IsEnum(GroupVisibility) visibility?: GroupVisibility;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(60) timezone?: string;

  /** O que quem entra como membro precisa compartilhar. Ausente = nada obrigatório. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  requiredSharingScopes?: ShareScope[];
}

/** Perfil da comunidade. Tipo e slug não mudam: o slug já está em links distribuídos. */
export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(JoinPolicy) joinPolicy?: JoinPolicy;
  @IsOptional() @IsEnum(GroupVisibility) visibility?: GroupVisibility;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(60) timezone?: string;
  @IsOptional() @IsEnum(PostPolicy) postPolicy?: PostPolicy;

  /** Vale para quem entrar dali em diante; ver `consent-scopes.ts`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  requiredSharingScopes?: ShareScope[];
}

export class SetAvatarDto {
  @IsOptional()
  @IsUUID()
  fileId!: string | null;
}

export class TransferOwnershipDto {
  @IsUUID()
  membershipId!: string;
}

/**
 * O que a pessoa escolhe compartilhar com a equipe ao entrar (ADR 026). Nada
 * vem marcado: ausente é "nada", e recusar tudo ainda entra.
 */
export class JoinConsentDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  scopes?: ShareScope[];

  @IsOptional()
  @IsBoolean()
  statsOptIn?: boolean;
}

/**
 * Entrar pelo código (#393): o código legível da equipe ou o slug. `slug` é o
 * nome antigo do campo, e o app instalado ainda manda; um dos dois basta.
 */
export class JoinGroupDto extends JoinConsentDto {
  @ValidateIf((o: JoinGroupDto) => o.code == null)
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  code?: string;
}

/** Papéis que um convite oferece. Dono não se convida: transfere-se. */
export const PAPEIS_CONVIDAVEIS = PAPEIS_CONCEDIVEIS;

export class CreateInviteDto {
  @IsIn(PAPEIS_CONVIDAVEIS as readonly string[])
  role!: (typeof PAPEIS_CONVIDAVEIS)[number];

  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxUses?: number;
  /** Link: até 30 dias (o service corta). Código de entrada: até 365. */
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
  /** Código de entrada legível em vez de link (#393). */
  @IsOptional() @IsBoolean() code?: boolean;
}

/** Convite em lote: até um dia inteiro de convites numa chamada. */
export class BatchInviteDto {
  @IsIn(PAPEIS_CONVIDAVEIS as readonly string[])
  role!: (typeof PAPEIS_CONVIDAVEIS)[number];

  // Strings soltas, e não `@IsEmail({ each })`: o inválido volta em `skipped`
  // com o motivo, em vez de recusar a lista inteira por um erro de digitação.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emails!: string[];

  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}

/**
 * Token do convite na URL. Formato fechado (32 bytes em base64url = 43
 * caracteres): lixo nem chega a virar consulta.
 */
export class InviteTokenParamDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'Convite inválido' })
  token!: string;
}

/**
 * Slug do preview, em DTO e não em `@Query('slug')` solto.
 *
 * O `ValidationPipe` global não valida primitivo avulso: sem esta classe o
 * `slug` chegava `undefined` no `findUnique`, o Prisma levantava
 * `PrismaClientValidationError` e — não havendo `ExceptionFilter` global — a
 * chamada sem query string virava **500** em vez de 400.
 */
/** `?code=` (código legível ou slug, #393) ou `?slug=`, o nome antigo. */
export class PreviewGroupDto {
  @ValidateIf((o: PreviewGroupDto) => o.code == null)
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  code?: string;
}

export class ChangeRoleDto {
  @IsIn(PAPEIS_CONCEDIVEIS as readonly string[])
  role!: (typeof PAPEIS_CONCEDIVEIS)[number];
}

export class ApproveMemberDto {
  @IsOptional()
  @IsIn(PAPEIS_CONCEDIVEIS as readonly string[])
  role?: (typeof PAPEIS_CONCEDIVEIS)[number];
}

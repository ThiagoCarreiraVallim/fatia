import { Type } from 'class-transformer';
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
  AutoPostKind,
  CommunitySection,
  GroupRole,
  InviteOrigin,
  GroupType,
  GroupVisibility,
  JoinPolicy,
  PostPolicy,
  ShareScope,
  TeamSpecialty,
} from '@prisma/client';

/**
 * Papéis que o dono pode conceder ao aprovar uma entrada.
 *
 * `OWNER` fica de fora: dono é quem criou o grupo, e transferir a propriedade é
 * operação separada, com confirmação. Fechar a lista aqui é o que impede a
 * aprovação de virar caminho de promoção acidental.
 */
export const GRANTABLE_ROLE_VALUES = [
  GroupRole.MEMBER,
  GroupRole.PROFESSIONAL,
  GroupRole.CREATOR,
  // A equipe nova da #404 (ADR 043). Quem pode dar cada um é o service
  // (`rolesGrantableBy`): o DTO só fecha o conjunto.
  GroupRole.ADMIN,
  GroupRole.RECEPTION,
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

/** Perfil da comunidade. O slug não muda: já está em links distribuídos. */
export class UpdateGroupDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsEnum(JoinPolicy) joinPolicy?: JoinPolicy;
  @IsOptional() @IsEnum(GroupVisibility) visibility?: GroupVisibility;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(60) timezone?: string;
  @IsOptional() @IsEnum(PostPolicy) postPolicy?: PostPolicy;

  /** Que conteúdo novo vira post automático no mural (#394). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(AutoPostKind).length)
  @IsEnum(AutoPostKind, { each: true })
  autoPosts?: AutoPostKind[];

  /** Vale para quem entrar dali em diante; ver `consent-scopes.ts`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(ShareScope).length)
  @IsEnum(ShareScope, { each: true })
  requiredSharingScopes?: ShareScope[];

  /** "Profissionais veem só quem acompanham" (#404). */
  @IsOptional() @IsBoolean() proSeeOnlyAssigned?: boolean;

  /** Patrocinada ou social (#413): só o dono, e sem assentos valendo para virar social. */
  @IsOptional() @IsEnum(GroupType) type?: GroupType;

  /**
   * Cor de destaque (#413). `null` volta à padrão. A regra do contraste é o
   * service que aplica, com a sugestão de tom na mensagem.
   */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(9)
  brandColor?: string | null;

  /** Seções escondidas para os membros (#413). Só visual. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(CommunitySection).length * 2)
  @IsEnum(CommunitySection, { each: true })
  hiddenSections?: CommunitySection[];
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
export const INVITABLE_ROLE_VALUES = GRANTABLE_ROLE_VALUES;

export class CreateInviteDto {
  @IsIn(INVITABLE_ROLE_VALUES as readonly string[])
  role!: (typeof INVITABLE_ROLE_VALUES)[number];

  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxUses?: number;
  /** Link: até 30 dias (o service corta). Código de entrada: até 365. */
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
  /** Código de entrada legível em vez de link (#393). */
  @IsOptional() @IsBoolean() code?: boolean;
  /** Nome do link que só a equipe vê (#401). */
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsEnum(InviteOrigin) origin?: InviteOrigin;
  /** "Sem prazo": só link ou QR (o e-mail vence em 30 dias). */
  @IsOptional() @IsBoolean() noExpiry?: boolean;
  @IsOptional() @IsUUID() accompaniedByMembershipId?: string;
  @IsOptional() @IsBoolean() giveSeat?: boolean;
}

/** Convite em lote: até um dia inteiro de convites numa chamada. */
export class BatchInviteDto {
  @IsIn(INVITABLE_ROLE_VALUES as readonly string[])
  role!: (typeof INVITABLE_ROLE_VALUES)[number];

  // Strings soltas, e não `@IsEmail({ each })`: o inválido volta em `skipped`
  // com o motivo, em vez de recusar a lista inteira por um erro de digitação.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emails!: string[];

  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
  @IsOptional() @IsUUID() accompaniedByMembershipId?: string;
  @IsOptional() @IsBoolean() giveSeat?: boolean;
}

/** Reenviar vários convites por e-mail (Pn-22, "Reenviar selecionados"). */
export class ResendInvitesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  inviteIds!: string[];
}

/** Filtros da Ativação pendente: origem, busca por e-mail e página. */
export class PendingInvitesQueryDto {
  @IsOptional() @IsIn([...Object.values(InviteOrigin), 'NONE']) origin?: InviteOrigin | 'NONE';
  @IsOptional() @IsString() @MaxLength(254) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}

/** `?include=left`: a aba "Saíram" de Membros (só para quem vê todos). */
export class ListMembersQueryDto {
  @IsOptional() @IsIn(['left']) include?: 'left';
}

/** Quem da equipe acompanha este membro; `null` = ninguém (#401). */
export class SetAccompaniedByDto {
  @ValidateIf((o: SetAccompaniedByDto) => o.accompaniedByMembershipId !== null)
  @IsUUID()
  accompaniedByMembershipId!: string | null;
}

/** Ação em massa sobre membros (Pn-04d): até 100 por vez. */
export class MemberBulkDto {
  @IsIn(['accompany', 'seat', 'unseat'])
  action!: 'accompany' | 'seat' | 'unseat';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  membershipIds!: string[];

  @IsOptional()
  @ValidateIf((o: MemberBulkDto) => o.accompaniedByMembershipId !== null)
  @IsUUID()
  accompaniedByMembershipId?: string | null;
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
  @IsIn(GRANTABLE_ROLE_VALUES as readonly string[])
  role!: (typeof GRANTABLE_ROLE_VALUES)[number];
}

export class ApproveMemberDto {
  @IsOptional()
  @IsIn(GRANTABLE_ROLE_VALUES as readonly string[])
  role?: (typeof GRANTABLE_ROLE_VALUES)[number];
}

/** A especialidade do profissional (#404); `null` tira. */
export class SetSpecialtyDto {
  @ValidateIf((o: SetSpecialtyDto) => o.specialty !== null)
  @IsEnum(TeamSpecialty)
  specialty!: TeamSpecialty | null;
}

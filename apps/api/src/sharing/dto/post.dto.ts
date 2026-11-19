import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { PostReactionKind, ReportReason } from '@fatia/db';
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, DISPLAY_NAME_PATTERN } from '../display-name';
import {
  ANNOUNCEMENT_TITLE_MAX,
  COMMENT_BODY_MAX,
  FEED_FILTERS,
  PIN_MAX_DAYS,
  POLL_MAX_DAYS,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  type FeedFilter,
  POST_MAX_IMAGES,
  POST_REACTIONS,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
} from '../post.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PostParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  id!: string;
}

export class CommentParamDto extends PostParamDto {
  @IsUUID()
  commentId!: string;
}

export class FeedQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsIn([...FEED_FILTERS])
  filter?: FeedFilter;
}

export class PollDto {
  @IsString()
  @MaxLength(POLL_QUESTION_MAX)
  question!: string;

  @IsArray()
  @ArrayMinSize(POLL_MIN_OPTIONS)
  @ArrayMaxSize(POLL_MAX_OPTIONS)
  @IsString({ each: true })
  @MaxLength(POLL_OPTION_MAX, { each: true })
  options!: string[];

  @IsInt()
  @Min(1)
  @Max(POLL_MAX_DAYS)
  days!: number;
}

class WithDisplayName {
  /** Ausente: o apelido que a pessoa já usa na comunidade, ou o primeiro nome. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(DISPLAY_NAME_MIN)
  @MaxLength(DISPLAY_NAME_MAX)
  @Matches(DISPLAY_NAME_PATTERN, { message: 'O apelido não pode ter quebra de linha nem < ou >.' })
  displayName?: string;
}

export class CreatePostDto extends WithDisplayName {
  @IsOptional()
  @IsString()
  @MaxLength(POST_BODY_MAX)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POST_MAX_IMAGES)
  @IsUUID('4', { each: true })
  imageFileIds?: string[];

  @IsOptional()
  @IsIn(['POST', 'POLL'])
  kind?: 'POST' | 'POLL';

  @IsOptional()
  @IsIn(['PERSON', 'GROUP'])
  publishedAs?: 'PERSON' | 'GROUP';

  @IsOptional()
  @IsBoolean()
  pin?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(PIN_MAX_DAYS)
  pinDays?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto;
}

export class PinDto {
  /** Dias no topo; ausente ou nulo = sem prazo. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(PIN_MAX_DAYS)
  days?: number | null;
}

export class PinOrderDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  postIds!: string[];
}

export class VoteDto {
  @IsUUID()
  optionId!: string;
}

export class AnnouncementDto {
  @IsString()
  @MaxLength(ANNOUNCEMENT_TITLE_MAX)
  title!: string;

  @IsString()
  @MaxLength(POST_BODY_MAX)
  body!: string;

  @IsIn(['PERSON', 'GROUP'])
  publishedAs!: 'PERSON' | 'GROUP';

  @IsBoolean()
  pin!: boolean;

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(PIN_MAX_DAYS)
  pinDays!: number | null;

  @IsBoolean()
  push!: boolean;

  /** Também por e-mail (#398); ausente = não. */
  @IsOptional()
  @IsBoolean()
  alsoEmail?: boolean;

  /** ISO do primeiro disparo; nulo = agora. */
  @ValidateIf((_, v) => v !== null)
  @IsString()
  at!: string | null;

  @IsIn(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
  repeat!: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export class AnnouncementParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  id!: string;
}

export class BlockDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  postId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  commentId?: string | null;
}

export class BlockParamDto {
  @IsUUID()
  id!: string;
}

export class CreateCommentDto extends WithDisplayName {
  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_BODY_MAX)
  body!: string;
}

export class ReactionDto {
  @IsIn([...POST_REACTIONS])
  kind!: PostReactionKind;
}

export class ReportDto {
  @IsIn([...REPORT_REASONS])
  reason!: ReportReason;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(REPORT_NOTE_MAX)
  note?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  commentId?: string | null;
}

export class RemovePostDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn([...REPORT_REASONS])
  reason?: ReportReason | null;
}

export class ReportParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  reportId!: string;
}

export class ResolveReportDto {
  @IsIn(['remove', 'dismiss'])
  action!: 'remove' | 'dismiss';
}

export class BanParamDto {
  @IsUUID()
  groupId!: string;

  @IsUUID()
  membershipId!: string;
}

import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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
  COMMENT_BODY_MAX,
  POST_BODY_MAX,
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

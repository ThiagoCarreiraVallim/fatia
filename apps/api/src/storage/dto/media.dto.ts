import { IsIn, IsInt, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import {
  MEDIA_LIMITS,
  MEDIA_PURPOSES,
  PERSONAL_MEDIA_PURPOSES,
  type MediaPurpose,
} from '../media.service';

const MIMES = [...MEDIA_LIMITS.IMAGE.mimes, ...MEDIA_LIMITS.VIDEO.mimes];

export class RequestUploadDto {
  @IsIn([...Object.keys(MEDIA_PURPOSES), ...Object.keys(PERSONAL_MEDIA_PURPOSES)])
  purpose!: MediaPurpose;

  /** Só nos propósitos da comunidade; a foto de perfil não tem comunidade. */
  @ValidateIf((o: RequestUploadDto) => !(o.purpose in PERSONAL_MEDIA_PURPOSES))
  @IsUUID()
  groupId?: string;

  @IsString()
  @IsIn(MIMES)
  mime!: string;

  @IsInt()
  @Min(1)
  @Max(MEDIA_LIMITS.VIDEO.maxBytes)
  bytes!: number;
}

/** A foto do chat (ADR 046): pessoal, sem grupo nem propósito no corpo. */
export class RequestChatPhotoUploadDto {
  @IsString()
  @IsIn(MEDIA_LIMITS.IMAGE.mimes)
  mime!: string;

  @IsInt()
  @Min(1)
  @Max(MEDIA_LIMITS.IMAGE.maxBytes)
  bytes!: number;
}

export class MediaIdParamDto {
  @IsUUID()
  id!: string;
}

import { IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import { MEDIA_LIMITS, MEDIA_PURPOSES, type MediaPurpose } from '../media.service';

const MIMES = [...MEDIA_LIMITS.IMAGE.mimes, ...MEDIA_LIMITS.VIDEO.mimes];

export class RequestUploadDto {
  @IsIn(Object.keys(MEDIA_PURPOSES))
  purpose!: MediaPurpose;

  @IsUUID()
  groupId!: string;

  @IsString()
  @IsIn(MIMES)
  mime!: string;

  @IsInt()
  @Min(1)
  @Max(MEDIA_LIMITS.VIDEO.maxBytes)
  bytes!: number;
}

export class MediaIdParamDto {
  @IsUUID()
  id!: string;
}

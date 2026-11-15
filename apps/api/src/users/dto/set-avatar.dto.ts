import { IsUUID } from 'class-validator';

export class SetAvatarDto {
  @IsUUID()
  fileId!: string;
}

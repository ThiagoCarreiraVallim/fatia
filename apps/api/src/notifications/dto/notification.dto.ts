import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { DevicePlatform } from '@fatia/db';
import { DEVICE_PLATFORMS } from '../notification.service';

export class RegisterDeviceDto {
  /** O formato exato da Expo é conferido no service. */
  @IsString()
  @MaxLength(200)
  token!: string;

  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;
}

export class DeviceParamDto {
  @IsUUID()
  id!: string;
}

/** Só os tipos enviados mudam; o resto fica como está. */
export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  COMMUNITY?: boolean;

  @IsOptional()
  @IsBoolean()
  CHALLENGES?: boolean;

  @IsOptional()
  @IsBoolean()
  FEED?: boolean;

  @IsOptional()
  @IsBoolean()
  MODERATION?: boolean;

  @IsOptional()
  @IsBoolean()
  CHAT?: boolean;
}

/** A inscrição que o `PushManager.subscribe` do navegador devolve, achatada. */
export class WebPushSubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

export class WebPushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

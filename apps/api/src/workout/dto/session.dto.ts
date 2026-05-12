import { IsISO8601, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StartSessionDto {
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsISO8601() startedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class FinishSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSessionDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListSessionsDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

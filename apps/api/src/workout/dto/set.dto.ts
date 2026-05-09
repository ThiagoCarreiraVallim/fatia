import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class LogSetBodyDto {
  @IsInt() exerciseId!: number;
  // strength
  @IsOptional() @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @IsInt() @Min(0) reps?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) rpe?: number;
  // cardio
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsOptional() @IsNumber() @Min(0) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(0) avgHeartRate?: number;
  @IsOptional() @IsInt() @Min(0) kcalBurned?: number;
  // common
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSetBodyDto {
  @IsOptional() @IsNumber() @Min(0) weightKg?: number;
  @IsOptional() @IsInt() @Min(0) reps?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) rpe?: number;
  @IsOptional() @IsInt() @Min(1) durationSeconds?: number;
  @IsOptional() @IsNumber() @Min(0) distanceMeters?: number;
  @IsOptional() @IsInt() @Min(0) avgHeartRate?: number;
  @IsOptional() @IsInt() @Min(0) kcalBurned?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanDto {
  @IsString() @MaxLength(100) name!: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

export class AddPlanExerciseDto {
  @IsInt() @Min(1) exerciseId!: number;
  @IsInt() @Min(1) order!: number;
  @IsInt() @Min(1) targetSets!: number;
  @IsString() @MaxLength(20) targetReps!: string; // "8-12", "5", "AMRAP"
}

export class UpdatePlanExerciseDto {
  @IsOptional() @IsInt() @Min(1) order?: number;
  @IsOptional() @IsInt() @Min(1) targetSets?: number;
  @IsOptional() @IsString() @MaxLength(20) targetReps?: string;
}

class ReorderItemDto {
  @IsUUID() id!: string;
  @IsInt() @Min(0) order!: number;
}

export class ReorderExercisesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  exercises!: ReorderItemDto[];
}

import { IsInt, IsOptional, Min } from 'class-validator';

export class UpsertGoalsDto {
  @IsInt() @Min(0) kcalMin!: number;
  @IsInt() @Min(0) kcalMax!: number;
  @IsInt() @Min(0) proteinMinG!: number;
  @IsInt() @Min(0) proteinMaxG!: number;
  @IsInt() @Min(0) carbsMinG!: number;
  @IsInt() @Min(0) carbsMaxG!: number;
  @IsInt() @Min(0) fatMinG!: number;
  @IsInt() @Min(0) fatMaxG!: number;

  @IsOptional() @IsInt() @Min(0) weeklyWorkouts?: number;
  @IsOptional() @IsInt() @Min(0) dailyStepsTarget?: number;
}

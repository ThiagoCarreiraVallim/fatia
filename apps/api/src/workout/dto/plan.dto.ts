import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CARDIO_INTENSITIES,
  CARDIO_TARGETS,
  LOAD_MODES,
  MAX_CARDIO_CALORIES,
  MAX_CARDIO_DISTANCE_METERS,
  MAX_CARDIO_INCLINE,
  MAX_CARDIO_PACE,
  MAX_LOAD_PERCENT,
  MIN_CARDIO_PACE,
  MAX_CARDIO_DURATION_SECONDS,
  MAX_LOAD_KG,
  MAX_PLAN_NOTES,
  MAX_PLAN_SETS,
  MAX_REST_SECONDS,
  MAX_SET_REPS,
  MAX_TARGET_SETS,
  PLAN_SET_KINDS,
  REP_UNITS,
  TECHNIQUES,
  type CardioIntensityValue,
  type CardioTargetValue,
  type LoadModeValue,
  type PlanSetKindValue,
  type RepUnitValue,
  type TechniqueValue,
} from '../helpers/plan-exercise-config';

/**
 * Opcional, mas não anulável: ausente passa, `null` cai na validação (400).
 * `@IsOptional` deixaria o `null` chegar a uma coluna NOT NULL — o Prisma
 * recusava com 500.
 */
const OptionalNotNull = () => ValidateIf((_o: unknown, value: unknown) => value !== undefined);

export class CreatePlanDto {
  @IsString() @MaxLength(100) name!: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

/** Uma série da tabela série por série (Al-T21b). */
export class PlanSetDto {
  @OptionalNotNull() @IsIn(PLAN_SET_KINDS) kind?: PlanSetKindValue;
  @IsInt() @Min(1) @Max(MAX_SET_REPS) reps!: number;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_LOAD_KG)
  loadKg?: number | null;
}

/**
 * A configuração do exercício no plano (#378, Al-T21 e Al-T21d). Os mesmos
 * campos na criação e na edição; `null` limpa o campo.
 *
 * `@IsOptional` deixa passar `null` e `undefined` — é o que permite limpar o
 * descanso ou a meta de cardio pela mesma rota. Os campos que não se limpam
 * (séries, faixa, unidade, técnica, ordem) usam `OptionalNotNull`.
 */
export class PlanExerciseConfigDto {
  @OptionalNotNull() @IsInt() @Min(1) @Max(MAX_TARGET_SETS) targetSets?: number;
  @OptionalNotNull() @IsString() @MaxLength(20) targetReps?: string; // "8-12", "5", "AMRAP"
  @OptionalNotNull() @IsIn(REP_UNITS) repUnit?: RepUnitValue;
  @OptionalNotNull() @IsIn(LOAD_MODES) loadMode?: LoadModeValue;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_LOAD_KG)
  startLoadKg?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(MAX_REST_SECONDS) restSeconds?: number | null;
  @OptionalNotNull() @IsIn(TECHNIQUES) technique?: TechniqueValue;
  @OptionalNotNull() @IsBoolean() biSetWithNext?: boolean;
  @IsOptional() @IsString() @MaxLength(MAX_PLAN_NOTES) notes?: string | null;

  @IsOptional() @IsIn(CARDIO_TARGETS) cardioTarget?: CardioTargetValue | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CARDIO_DURATION_SECONDS)
  cardioDurationSeconds?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 })
  @Min(1)
  @Max(MAX_CARDIO_DISTANCE_METERS)
  cardioDistanceMeters?: number | null;

  @IsOptional() @IsIn(CARDIO_INTENSITIES) cardioIntensity?: CardioIntensityValue | null;

  // Editor da equipe (#406): os mesmos campos valem no plano da própria pessoa.
  /** "Série de aquecimento antes". */
  @OptionalNotNull() @IsBoolean() warmupBefore?: boolean;
  /** % do 1RM, com `loadMode` PERCENT_1RM. */
  @IsOptional() @IsInt() @Min(1) @Max(MAX_LOAD_PERCENT) loadPercent?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_CARDIO_CALORIES) cardioCalories?: number | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(MAX_CARDIO_INCLINE)
  cardioInclinePercent?: number | null;

  /** Intensidade por zona (1–5), ritmo (s/km) ou esforço (RPE 1–10): uma das três. */
  @IsOptional() @IsInt() @Min(1) @Max(5) cardioZone?: number | null;
  @IsOptional()
  @IsInt()
  @Min(MIN_CARDIO_PACE)
  @Max(MAX_CARDIO_PACE)
  cardioPaceSecondsPerKm?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10) cardioRpe?: number | null;

  /** Série por série. Lista vazia ou `null` volta ao modo simples. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PLAN_SETS)
  @ValidateNested({ each: true })
  @Type(() => PlanSetDto)
  sets?: PlanSetDto[] | null;
}

export class AddPlanExerciseDto extends PlanExerciseConfigDto {
  @IsInt() @Min(1) exerciseId!: number;
  /** Posição. Sem ela, o exercício entra no fim do plano. */
  @OptionalNotNull() @IsInt() @Min(0) order?: number;
}

export class UpdatePlanExerciseDto extends PlanExerciseConfigDto {
  @OptionalNotNull() @IsInt() @Min(0) order?: number;
}

class AddManyItemDto {
  @IsInt() @Min(1) exerciseId!: number;
}

/** Adicionar exercício com seleção múltipla (Al-T8): entram no fim, na ordem da seleção. */
export class AddPlanExercisesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AddManyItemDto)
  exercises!: AddManyItemDto[];
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

/** A ordem dos planos no app (#402): o primeiro é o treino de hoje. */
export class ReorderPlansDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  planIds!: string[];
}

import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SetupStep } from '@fatia/db';

export class SetupStepParamDto {
  @IsUUID()
  groupId!: string;

  /** Só os que se marcam à mão; "Marca" e "Criar" nunca. */
  @IsIn([
    SetupStep.CATEGORIES,
    SetupStep.TEAM,
    SetupStep.MEMBERS,
    SetupStep.CHALLENGE,
    SetupStep.PLAN,
    SetupStep.EQUIPMENT,
    SetupStep.ACCESS,
  ])
  step!: SetupStep;
}

export class SetupStepDto {
  @IsBoolean()
  done!: boolean;
}

export class SetupGuideDto {
  /** `true` = "Repetir o guia"; `false` = fechar. */
  @IsBoolean()
  visible!: boolean;
}

export class SlugCheckQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

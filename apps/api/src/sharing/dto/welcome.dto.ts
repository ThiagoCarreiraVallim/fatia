import { GroupWelcomeKind } from '@fatia/db';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Uma página do editor (#410, Pn-23). Os limites de verdade (texto até 300
 * caracteres contados como o aluno vê, título não vazio) ficam no service, que
 * também é o que o CHECK da migration confere; aqui só barra o absurdo.
 */
export class WelcomePageDto {
  @IsEnum(GroupWelcomeKind) kind!: GroupWelcomeKind;
  @IsString() @MaxLength(1200) title!: string;
  @IsString() @MaxLength(4000) body!: string;
  @IsBoolean() showTeam!: boolean;
}

/** `PUT /groups/:groupId/welcome`: o conjunto inteiro, na ordem. */
export class SaveWelcomeDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => WelcomePageDto)
  pages!: WelcomePageDto[];

  @IsBoolean() showOnJoin!: boolean;
  @IsBoolean() published!: boolean;
}

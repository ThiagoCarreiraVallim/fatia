import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AGENT_INSTRUCTIONS_MAX,
  AGENT_NAME_MAX,
  AGENT_NAME_MIN,
  AGENT_NAME_PATTERN,
} from '../group-agent.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** O agente da comunidade, como o dono salva no painel. */
export class GroupAgentDto {
  @Transform(trim)
  @IsString()
  @MinLength(AGENT_NAME_MIN)
  @MaxLength(AGENT_NAME_MAX)
  @Matches(AGENT_NAME_PATTERN, { message: 'O nome não pode ter quebra de linha nem < ou >.' })
  name!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(AGENT_INSTRUCTIONS_MAX)
  instructions!: string;

  @IsBoolean()
  enabled!: boolean;

  /** Ausente mantém o avatar; `null` tira. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  avatarFileId?: string | null;
}

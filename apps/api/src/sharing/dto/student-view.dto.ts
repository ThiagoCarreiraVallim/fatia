import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ShareScope } from '@prisma/client';

/** Janela padrão do painel. Um mês cobre o ciclo de acompanhamento típico. */
export const DIAS_PADRAO = 30;
export const DIAS_MIN = 7;
export const DIAS_MAX = 365;

export class StudentReadQueryDto {
  /**
   * **Um** escopo por requisição, e obrigatório.
   *
   * Aceitar uma lista traria de volta o problema que `assertReadable` resolve
   * com `has` em vez de `hasSome`: uma chamada conferida por um escopo e
   * respondida com vários. Aqui o que o cliente pede é exatamente o que é
   * conferido e exatamente o que é gravado na trilha do aluno.
   */
  @IsEnum(ShareScope)
  scope!: ShareScope;

  /**
   * `@Type` porque query string chega como texto e o `ValidationPipe` global
   * não converte sozinho — sem isto `@IsInt` reprovaria todo valor enviado.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(DIAS_MIN)
  @Max(DIAS_MAX)
  days?: number;
}

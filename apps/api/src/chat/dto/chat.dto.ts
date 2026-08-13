import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Teto do que a pessoa manda num turno.
 *
 * Não é anti-abuso — o `ChatThrottlerGuard` e a cota fazem isso. É contenção de
 * custo por turno: o histórico inteiro é reenviado a cada mensagem, então uma
 * mensagem gigante é paga de novo em todos os turnos seguintes da conversa.
 * 4.000 caracteres cobrem com folga qualquer pergunta escrita no celular.
 */
const TETO_DA_MENSAGEM = 4_000;

/**
 * Teto de propostas aprovadas por turno.
 *
 * O agente propõe no máximo `MAX_TOOLS_POR_RODADA` (5) numa rodada, e o PWA só
 * pode aprovar o que recebeu. O teto é o mesmo número: acima dele é cliente
 * inventando, e um `ValidateNested` sobre array sem limite é o caminho conhecido
 * para gastar CPU de validação com um corpo grande.
 */
const TETO_DE_APROVADAS = 5;

/**
 * Uma proposta aprovada na tela, ecoada de volta para executar (ADR 022).
 *
 * **Não é autoridade sobre o que roda, e não precisa ser.** A tool executa com o
 * Bearer da própria pessoa contra os dados dela, e o recorte de três camadas do
 * agente continua valendo: adulterar `arguments` aqui não alcança nada que a
 * pessoa já não pudesse fazer pela tela do app. O que o eco garante é o oposto —
 * que o agente execute o que estava no modal, e não o que o modelo reformulou.
 */
export class ApprovedToolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /**
   * O texto do JSON como o evento `proposal` o mandou.
   *
   * `@IsString()` sem `@IsNotEmpty()`: tool sem parâmetro é proposta com `{}` ou
   * com string vazia, e recusar a vazia transformaria o caso legítimo em 400.
   */
  @IsString()
  @MaxLength(TETO_DA_MENSAGEM)
  arguments!: string;
}

export class SendChatMessageDto {
  /**
   * Conversa a continuar. Ausente cria uma nova.
   *
   * **Este é o id que vem do corpo**, e é exatamente o formato que produziu
   * escrita entre contas na #204. Ele nunca é usado sem o `userId` do
   * `@CurrentUser()` no mesmo `where` — ver `ConversationService`.
   */
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(TETO_DA_MENSAGEM)
  message!: string;

  /** Propostas que a pessoa aprovou na tela. Ver `ApprovedToolDto`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TETO_DE_APROVADAS)
  @ValidateNested({ each: true })
  @Type(() => ApprovedToolDto)
  approved?: ApprovedToolDto[];
}

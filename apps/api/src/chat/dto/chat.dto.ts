import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Teto do que a pessoa manda num turno.
 *
 * Não é anti-abuso — o `ChatThrottlerGuard` e a cota fazem isso. É contenção de
 * custo por turno: o histórico inteiro é reenviado a cada mensagem, então uma
 * mensagem gigante é paga de novo em todos os turnos seguintes da conversa.
 * 4.000 caracteres cobrem com folga qualquer pergunta escrita no celular.
 */
const TETO_DA_MENSAGEM = 4_000;

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
}

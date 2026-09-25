import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_FOTOS_POR_MENSAGEM, TETO_DA_FOTO_DO_CHAT } from '../corpos-do-chat';

/**
 * Teto da mensagem que a pessoa acabou de escrever. É o mesmo do agente
 * (`MAX_CARACTERES_POR_MENSAGEM`): recusar aqui poupa uma ida e volta que o
 * agente recusaria de qualquer jeito.
 */
const TETO_DA_MENSAGEM = 4_000;

const TETO_DO_TITULO = 80;

const TETO_DO_COMENTARIO = 2_000;

/** A resposta a uma pausa do agente (ADR 023). */
export class ChatResumeDto {
  /**
   * Qual pausa esta resposta responde. O agente recusa com 409 um id que não é o
   * da pausa pendente — é o que impede uma resposta dada a uma pergunta de ser
   * reenviada contra uma confirmação de escrita.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  interruptId!: string;

  /**
   * O que a pessoa respondeu: `{ approvals: { [toolCallId]: boolean } }` numa
   * confirmação, a resposta (texto ou formulário) numa pergunta. Repassado **sem
   * interpretação**: quem sabe o que cada pausa espera é o agente, que é quem a
   * abriu. O teto é o do corpo da requisição.
   */
  @IsDefined()
  value!: unknown;
}

/**
 * Uma foto do turno, em base64. **Só JPEG**: é o que o PWA produz ao recodificar
 * (o que já tira o EXIF no aparelho), e é o formato de que a API sabe remover
 * metadados de novo antes de repassar (`removerMetadadosDoJpeg`).
 */
export class ChatPhotoDto {
  @IsIn(['image/jpeg'])
  mediaType!: 'image/jpeg';

  @IsBase64()
  @MaxLength(Math.ceil((TETO_DA_FOTO_DO_CHAT * 4) / 3) + 4)
  data!: string;
}

/**
 * Um turno de conversa: uma mensagem nova **ou** a resposta a uma pausa.
 *
 * `conversationId` é obrigatório e gerado pelo PWA na primeira mensagem — é ele
 * que dá à conversa um endereço (`/chat/<id>`) antes de o primeiro byte voltar, e
 * que torna uma pausa retomável depois de um F5. O NestJS amarra o id ao usuário
 * do token: um id que já é de outra pessoa é 404.
 */
export class SendChatMessageDto {
  @IsUUID()
  conversationId!: string;

  @ValidateIf((dto: SendChatMessageDto) => dto.resume === undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(TETO_DA_MENSAGEM)
  message?: string;

  @ValidateIf((dto: SendChatMessageDto) => dto.message === undefined)
  @IsDefined({ message: 'envie message (turno novo) ou resume (resposta a uma pausa)' })
  @ValidateNested()
  @Type(() => ChatResumeDto)
  resume?: ChatResumeDto;

  /** Vivem só neste turno: nada da foto é gravado (ADR 004 e 020). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FOTOS_POR_MENSAGEM)
  @ValidateNested({ each: true })
  @Type(() => ChatPhotoDto)
  photos?: ChatPhotoDto[];
}

export class ListConversationsQueryDto {
  /** Busca no título, sem diferenciar maiúscula. */
  @IsOptional()
  @IsString()
  @MaxLength(TETO_DO_TITULO)
  q?: string;
}

export class RenameConversationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(TETO_DO_TITULO)
  title!: string;
}

export const MOTIVOS_DE_VOTO = [
  'incorrect',
  'incomplete',
  'did_not_follow',
  'wrong_data',
  'slow',
  'other',
] as const;

/**
 * O voto numa resposta. `review: null` desfaz o voto.
 *
 * O motivo vem de uma lista fechada, e não de texto livre, pelo mesmo motivo da
 * lista de `ai-quota.ts`: é o que dá para somar. O texto livre é `note`, e é
 * opcional — quem clica 👎 e fecha a janela já disse o mais importante.
 */
export class MessageFeedbackDto {
  @ValidateIf((_dto: MessageFeedbackDto, valor: unknown) => valor !== null)
  @IsIn(['like', 'dislike'])
  review!: 'like' | 'dislike' | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MOTIVOS_DE_VOTO.length)
  @IsIn(MOTIVOS_DE_VOTO, { each: true })
  reasons?: (typeof MOTIVOS_DE_VOTO)[number][];

  @IsOptional()
  @IsString()
  @MaxLength(TETO_DO_COMENTARIO)
  note?: string;
}

import type { MensagemDoHistorico } from '../chat/conversation.service';
import type { ChatPersona } from '../sharing/group-agent.service';

/**
 * O que o `apps/api` pede ao `apps/agent`, sem dizer como.
 *
 * É uma classe abstrata, e não uma interface, porque é também o token de injeção:
 * o `AiModule` liga a implementação HTTP (`HttpAgentAdapter`) e os testes ligam
 * um adapter falso, sem `fetch` dublê.
 *
 * **Só o `HostedAiService` recebe este adapter.** O `AiModule` não o exporta, e é
 * isso que impede um service de domínio de chamar o agente sem passar pelo portão
 * de plano e cota e sem gravar o uso: o Nest recusa a injeção fora do módulo.
 */
export abstract class AgentAdapter {
  /** `true` quando esta instância tem agente configurado (`AGENT_BASE_URL`). */
  abstract configured(): boolean;

  /**
   * Foto e ditado, pelo que o `/capabilities` do agente anuncia como usável, com
   * cache. **Nunca lança:** agente fora do ar é "sem foto e sem voz".
   */
  abstract capabilities(): Promise<AgentCapabilities>;

  /**
   * Abre o stream do chat. Tudo que pode falhar com status HTTP falha aqui, antes
   * de o controller escrever um byte na resposta.
   */
  abstract openTurn(input: TurnInput): Promise<AgentStream>;

  /** Áudio → texto (#141). */
  abstract transcribe(audio: Buffer, contentType: string): Promise<AgentTranscription>;

  /** O nome da conversa. **Nunca lança**: `null` deixa o recorte da primeira mensagem. */
  abstract title(text: string): Promise<AgentTitle | null>;

  /** Foto JPEG já sem metadados → alimentos candidatos (#139). */
  abstract recognizeMeal(jpeg: Buffer): Promise<AgentMealRecognition>;

  /** O voto de uma resposta, para o trace do turno (ADR 034). **Nunca lança.** */
  abstract sendFeedback(
    runId: string,
    review: 'like' | 'dislike' | null,
    reasons: string[],
  ): Promise<void>;
}

/** Erro depois que o cabeçalho já foi para o cliente — não vira mais status HTTP. */
export class AgentStreamError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentStreamError';
  }
}

export interface AgentStream {
  /** Os bytes crus do agente, na ordem em que chegam. */
  chunks(): AsyncGenerator<Uint8Array>;
  /** Corta o upstream — inferência custa. */
  cancel(): void;
}

export type TurnInput = {
  bearer: string;
  /** O fuso do perfil. Vira a data de hoje no prompt do agente. */
  timezone: string;
  /** A conversa. O agente monta a thread com ela e com o dono que o token diz. */
  conversationId: string;
  /** O que já foi dito, em ordem cronológica. O agente só lê numa thread fria. */
  history: MensagemDoHistorico[];
  /** O que a pessoa pediu para o assistente lembrar. Entra cercado no prompt. */
  memories?: { id: string; content: string }[];
  /** O agente da comunidade nesta conversa (Fase 7c). Ausente: o assistente da Fatia. */
  persona?: ChatPersona;
} & (
  | {
      message: string;
      resume?: undefined;
      /** Já sem metadados — ver `ChatService.fotosDoTurno`. */
      photos?: { mediaType: 'image/jpeg'; data: string }[];
    }
  | {
      message?: undefined;
      /**
       * A resposta a uma pausa, repassada **sem interpretação**: esta camada não
       * sabe o que `log_meal` faz nem tem por que saber. Quem confere a pausa e
       * executa o que foi aprovado é o agente (ADR 023).
       */
      resume: { interruptId: string; value: unknown };
    }
);

/** O que uma chamada consumiu, como o agente reportou. Unidade ausente é custo não medido. */
export type AgentUsage = { model: string; inputUnits?: number; outputUnits?: number };

/** O que o chat desta instância sabe fazer além de texto. */
export type AgentCapabilities = { vision: boolean; transcription: boolean };

export type AgentTranscription = {
  text: string;
  /** `inputUnits` são segundos de áudio. `null` quando o agente não disse o modelo. */
  usage: AgentUsage | null;
};

export type AgentTitle = { title: string | null; usage: AgentUsage | null };

/** Um item como o modelo o viu. Espelha `schemas/recognized_meal.py`. */
export interface AgentRecognizedItem {
  name: string;
  grams: number;
  confidence: number;
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}

export type AgentMealRecognition = {
  items: AgentRecognizedItem[];
  note: string | null;
  usage: AgentUsage | null;
};

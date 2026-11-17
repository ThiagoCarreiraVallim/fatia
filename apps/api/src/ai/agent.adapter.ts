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

  /** Foto JPEG já sem metadados da tabela nutricional → valores lidos (#375). */
  abstract readLabel(jpeg: Buffer): Promise<AgentLabelReading>;

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
  /**
   * A busca na web (#384): `off` não oferece, `ask` pede o aceite antes da primeira, `on` busca.
   * Ausente é `off`: quem não diz não liga a busca.
   */
  webSearch?: 'off' | 'ask' | 'on';
  /**
   * O modo da IA por categoria (ADR 039, #385): `auto` são as escritas que gravam sem pausa (com o
   * cartão "Gravado" e Desfazer), `off` as que saem do catálogo do modelo. Ausente: tudo pede OK.
   */
  toolModes?: { auto: string[]; off: string[] };
  /**
   * O token do turno (#385). O agente o manda no header da gravação automática, e o `/mcp` só
   * aceita a gravação se ele for de um turno ativo desta conversa e desta pessoa.
   */
  runToken?: string;
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

/**
 * O consumo de uma chamada que **chegou ao provedor e falhou depois** (o rótulo
 * que veio fora de forma, #375). O provedor cobrou; o erro leva o custo até
 * `HostedAiService`, que o lança na cota antes de repassar o erro.
 */
const SPENT = new WeakMap<object, AgentUsage>();

export function withSpentUsage<E extends object>(error: E, usage: AgentUsage): E {
  SPENT.set(error, usage);
  return error;
}

export function spentUsage(error: unknown): AgentUsage | null {
  return typeof error === 'object' && error !== null ? (SPENT.get(error) ?? null) : null;
}

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

/**
 * A tabela nutricional como o modelo a leu (#375). Espelha
 * `schemas/label_reading.py`. `per` diz a base dos números: a coluna "100 g"
 * quando o rótulo a tem, senão a da porção. Campo ilegível vem `null`.
 */
export interface AgentLabel {
  name: string | null;
  per: 'serving' | '100g';
  serving_grams: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  note: string | null;
}

export type AgentLabelReading = { label: AgentLabel; usage: AgentUsage | null };

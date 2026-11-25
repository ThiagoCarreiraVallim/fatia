import {
  AgentAdapter,
  type AgentCapabilities,
  type AgentLabelReading,
  type AgentMealRecognition,
  type AgentStream,
  type AgentTitle,
  type AgentTranscription,
  type TurnInput,
} from '../agent.adapter';

/**
 * O agente sem rede, para os testes de quem usa a IA hospedada.
 *
 * Estende o `AgentAdapter` de verdade: mudar a assinatura do contrato quebra
 * este arquivo no `tsc`, em vez de deixar um dublê com forma que a realidade não
 * tem passar verde. Cada método é um `jest.fn`, para o teste trocar a resposta e
 * contar as chamadas.
 */
export class FakeAgentAdapter extends AgentAdapter {
  readonly configured = jest.fn((): boolean => true);
  readonly capabilities = jest.fn(async (): Promise<AgentCapabilities> => ({
    vision: true,
    transcription: true,
  }));
  readonly openTurn = jest.fn(async (_input: TurnInput): Promise<AgentStream> => emptyStream());
  readonly transcribe = jest.fn(
    async (_audio: Buffer, _contentType: string): Promise<AgentTranscription> => ({
      text: 'registra 200 g de frango',
      usage: { model: 'google/gemini-3.5-flash-lite', inputUnits: 150, outputUnits: 22 },
    }),
  );
  readonly title = jest.fn(async (_text: string): Promise<AgentTitle | null> => null);
  readonly recognizeMeal = jest.fn(async (_jpeg: Buffer): Promise<AgentMealRecognition> => ({
    items: [],
    note: null,
    usage: { model: 'z-ai/glm-5.3-flash', inputUnits: 1200, outputUnits: 90 },
  }));
  readonly readLabel = jest.fn(async (_jpeg: Buffer): Promise<AgentLabelReading> => ({
    label: {
      name: null,
      per: '100g',
      serving_grams: null,
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sodium_mg: null,
      note: null,
    },
    usage: { model: 'z-ai/glm-5.3-flash', inputUnits: 900, outputUnits: 60 },
  }));
  readonly sendFeedback = jest.fn(
    async (_runId: string, _review: 'like' | 'dislike' | null, _reasons: string[]) => undefined,
  );
}

/** Um stream que termina sem nenhum byte. */
export function emptyStream(): AgentStream {
  return {
    cancel: () => undefined,
    // eslint-disable-next-line require-yield
    async *chunks() {
      return;
    },
  };
}

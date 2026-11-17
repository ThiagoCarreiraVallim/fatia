import { ApiError, type AiConsentStatus } from '@fatia/api-client';

/**
 * O aceite da IA (#384) visto pelo app, sem tela: carregando ou sem conseguir ler, o chat
 * fica fechado (escrever só daria num 403) e, quando a leitura falha, o aceite aparece —
 * aceitar de novo é inofensivo.
 */
export function chatUnlocked(data: AiConsentStatus | undefined): boolean {
  return data?.chat.accepted === true;
}

export function showChatConsent({
  data,
  isPending,
}: {
  data: AiConsentStatus | undefined;
  isPending: boolean;
}): boolean {
  return !isPending && data?.chat.accepted !== true;
}

/** O 403 `AI_CONSENT_REQUIRED` do servidor: o ditado, a foto e o rótulo abrem o aceite. */
export function needsAiConsent(error: unknown): boolean {
  return error instanceof ApiError && error.isAiConsentRequired;
}

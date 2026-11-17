import { describe, expect, it } from 'vitest';
import { ApiError, type AiConsentStatus } from '@fatia/api-client';
import { chatUnlocked, needsAiConsent, showChatConsent } from '../ai-consent-state';

const estado = (accepted: boolean): AiConsentStatus =>
  ({
    chat: { accepted },
    webSearch: { accepted: false },
    webSearchEnabled: false,
  }) as unknown as AiConsentStatus;

/** Carregando ou sem conseguir ler os aceites, o chat fica fechado e o aceite aparece. */
describe('estado do aceite da IA no app', () => {
  it('o campo só abre com o aceite confirmado', () => {
    expect(chatUnlocked(undefined)).toBe(false);
    expect(chatUnlocked(estado(false))).toBe(false);
    expect(chatUnlocked(estado(true))).toBe(true);
  });

  it('o aceite aparece sem aceite e também quando a leitura falhou', () => {
    expect(showChatConsent({ data: undefined, isPending: true })).toBe(false);
    expect(showChatConsent({ data: undefined, isPending: false })).toBe(true);
    expect(showChatConsent({ data: estado(false), isPending: false })).toBe(true);
    expect(showChatConsent({ data: estado(true), isPending: false })).toBe(false);
  });

  it('só o 403 AI_CONSENT_REQUIRED pede o aceite', () => {
    expect(needsAiConsent(new ApiError('x', 403, { code: 'AI_CONSENT_REQUIRED' }))).toBe(true);
    expect(needsAiConsent(new ApiError('x', 403, { code: 'FORBIDDEN' }))).toBe(false);
    expect(needsAiConsent(new ApiError('x', 402, {}))).toBe(false);
    expect(needsAiConsent(new Error('rede'))).toBe(false);
    expect(needsAiConsent(null)).toBe(false);
  });
});

import { ApiError } from '@fatia/api-client';

/**
 * Texto de erro das telas de nutrição — o mesmo `mensagemDeErro` do app
 * (`apps/mobile/src/components/nutrition/helpers.ts`).
 *
 * O 409 de refeição duplicada vem da API com texto escrito para o agente
 * ("Refeição idêntica já registrada (id …): … ajuste eatenAt"). Mostrado como
 * está, a pessoa lê um id e um nome de campo e não entende que já salvou — e
 * registra de novo. Daí a mensagem própria para o conflito.
 */
export const MEAL_CONFLICT_MESSAGE = 'Essa refeição já foi registrada.';

export function errorMessage(
  error: unknown,
  options?: { conflict?: string; fallback?: string },
): string {
  if (error instanceof ApiError && error.isConflict) {
    return options?.conflict ?? MEAL_CONFLICT_MESSAGE;
  }
  if (error instanceof Error && error.message) return error.message;
  return options?.fallback ?? 'Não foi possível concluir. Tente de novo.';
}

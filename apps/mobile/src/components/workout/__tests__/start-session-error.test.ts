import { describe, expect, it } from 'vitest';
import { ApiError } from '@fatia/api-client';
import { startSessionErrorMessage } from '../start-session-handlers';

/**
 * O "Começar" da prévia (#484): um erro que não é o 409 da sessão já aberta
 * precisa aparecer na folha. Sem isso a folha fechava e a pessoa não sabia que
 * o treino não começou.
 */
describe('mensagem de erro ao começar o treino', () => {
  it('erro de rede: avisa', () => {
    expect(startSessionErrorMessage(new Error('Network request failed'))).toBe(
      'Não foi possível começar o treino.',
    );
  });

  it('409 com a sessão já aberta: não é erro, a pessoa cai nela', () => {
    const conflict = new ApiError('Já existe uma sessão aberta', 409, {
      activeSessionId: '11111111-1111-1111-1111-111111111111',
    });
    expect(startSessionErrorMessage(conflict)).toBeNull();
  });

  it('sem erro, sem mensagem', () => {
    expect(startSessionErrorMessage(null)).toBeNull();
  });
});

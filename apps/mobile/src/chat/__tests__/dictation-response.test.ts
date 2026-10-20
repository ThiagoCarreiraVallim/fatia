import { describe, expect, it, vi } from 'vitest';
import { textoDeErroDoChat } from '@fatia/api-client';
import { readDictationResponse } from '../dictation-response';

/** O ditado lido como as demais chamadas do app: sessão encerrada no 401, texto do chat no 402. */
describe('readDictationResponse', () => {
  it('401 encerra a sessão pelo transporte, como qualquer chamada', async () => {
    const onUnauthorized = vi.fn();

    const resultado = await readDictationResponse(401, '', { onUnauthorized });

    expect(onUnauthorized).toHaveBeenCalledWith({ path: '/api/chat/transcribe', body: null });
    expect(resultado.text).toBeNull();
    expect(resultado.error).toBe(textoDeErroDoChat({ code: 'AI_UNAUTHORIZED' }));
  });

  it('402 usa o texto de plano exigido do resto do app', async () => {
    const corpo = JSON.stringify({ code: 'AI_PLAN_REQUIRED', message: 'interno' });
    const semCodigo = '{}';

    for (const body of [corpo, semCodigo]) {
      const { error } = await readDictationResponse(402, body, {});
      expect(error).toBe(textoDeErroDoChat({ code: 'AI_PLAN_REQUIRED' }));
    }
  });

  it('cota estourada diz quando volta', async () => {
    const body = JSON.stringify({ code: 'AI_QUOTA_EXCEEDED', resetsAt: 'não é data' });
    const { error } = await readDictationResponse(429, body, {});
    expect(error).toBe(textoDeErroDoChat({ code: 'AI_QUOTA_EXCEEDED' }));
  });

  it('sucesso devolve o texto aparado; vazio não vira texto', async () => {
    await expect(readDictationResponse(200, '{"text":"  almocei  "}', {})).resolves.toEqual({
      text: 'almocei',
      error: null,
    });
    await expect(readDictationResponse(200, '{"text":"  "}', {})).resolves.toEqual({
      text: null,
      error: null,
    });
  });

  it('outro erro fica com o texto genérico do ditado', async () => {
    const { error } = await readDictationResponse(500, 'não é json', {});
    expect(error).toBe('Não deu para transcrever agora. Tente de novo ou digite.');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../copy-text';

/**
 * Revisão da #388: o app copiava o endereço do MCP sem tratar falha. Com a
 * área de transferência bloqueada, a promessa rejeitava sem ninguém ouvir e a
 * tela não dizia nada (a web diz para copiar à mão).
 */
describe('copyText', () => {
  it('copiou', async () => {
    const write = vi.fn().mockResolvedValue(true);
    await expect(copyText(write, 'https://api.test/mcp')).resolves.toBe('copied');
    expect(write).toHaveBeenCalledWith('https://api.test/mcp');
  });

  it('a área de transferência recusou (rejeita)', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'));
    await expect(copyText(write, 'x')).resolves.toBe('failed');
  });

  it('o expo-clipboard devolveu false (não salvou)', async () => {
    await expect(copyText(vi.fn().mockResolvedValue(false), 'x')).resolves.toBe('failed');
  });

  it('versões antigas devolvem void: conta como copiado', async () => {
    await expect(copyText(vi.fn().mockResolvedValue(undefined), 'x')).resolves.toBe('copied');
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import type { McpToolContext } from '../../common/decorators/tool.decorator';
import type { AiAccessService } from '../../ai/ai-access.service';
import type { AiUsageService } from '../../ai/ai-usage.service';
import { AiPlanRequiredException } from '../../ai/ai-access.service';
import type { BraveSearchService } from '../brave-search.service';
import { SearchWebTool } from '../mcp/search-web.tool';

/**
 * A tool é fina de propósito. O que ela decide: quantos resultados pedir quando
 * ninguém disse, o que **não** repassar ao buscador, e quem paga — a pessoa,
 * pela cota de IA, conferida antes de cada consulta.
 */

const CTX = { userId: 'user-a' } as McpToolContext;
const PRO_PROPRIO = { tier: 'PRO', source: 'USER' };

function montar(
  opcoes: { resultados?: unknown[]; acesso?: () => Promise<unknown>; falhaBrave?: Error } = {},
) {
  const buscar = jest.fn(async () => {
    if (opcoes.falhaBrave) throw opcoes.falhaBrave;
    return opcoes.resultados ?? [];
  });
  const assertPodeUsar = jest.fn(opcoes.acesso ?? (async () => PRO_PROPRIO));
  const record = jest.fn(async () => undefined);
  const tool = new SearchWebTool(
    { buscar } as unknown as BraveSearchService,
    { assertPodeUsar } as unknown as AiAccessService,
    { record } as unknown as AiUsageService,
  );
  return { tool, buscar, assertPodeUsar, record };
}

describe('SearchWebTool', () => {
  it('pede 5 resultados quando o modelo não escolhe', async () => {
    const { tool, buscar } = montar();
    await tool.execute({ query: 'creatina' }, CTX);

    expect(buscar).toHaveBeenCalledWith('creatina', 5);
  });

  it('respeita o limite que o modelo pediu', async () => {
    const { tool, buscar } = montar();
    await tool.execute({ query: 'creatina', limit: 10 }, CTX);

    expect(buscar).toHaveBeenCalledWith('creatina', 10);
  });

  it('não repassa nada do usuário ao serviço de busca', async () => {
    // A assinatura de `buscar` não tem por onde receber o `userId`, e é essa a
    // garantia. O caso existe para que acrescentar um terceiro argumento com o
    // contexto — que é a mudança tentadora — não passe despercebido.
    const { tool, buscar } = montar();
    await tool.execute({ query: 'creatina' }, CTX);

    const argumentos = buscar.mock.calls[0] as unknown[];
    expect(argumentos).toHaveLength(2);
    expect(JSON.stringify(argumentos)).not.toContain('user-a');
  });

  it('devolve a consulta junto do resultado', async () => {
    const resultados = [{ title: 'x', url: 'https://ex.com', description: 'y' }];
    const { tool } = montar({ resultados });

    await expect(tool.execute({ query: 'creatina 2025' }, CTX)).resolves.toEqual({
      query: 'creatina 2025',
      results: resultados,
    });
  });

  it('é servida só ao agente da Fatia', () => {
    expect(montar().tool.agentOnly).toBe(true);
  });

  describe('quem paga é a pessoa, pela cota de IA', () => {
    it('confere plano e cota antes de buscar, e lança a consulta no livro-caixa', async () => {
      const { tool, assertPodeUsar, buscar, record } = montar();
      await tool.execute({ query: 'creatina' }, CTX);

      expect(assertPodeUsar).toHaveBeenCalledWith('user-a');
      expect(assertPodeUsar.mock.invocationCallOrder[0]).toBeLessThan(
        buscar.mock.invocationCallOrder[0],
      );
      expect(record).toHaveBeenCalledWith('user-a', {
        feature: 'web_search',
        model: 'brave-search',
        units: { inputUnits: 1, outputUnits: 0 },
        paidBy: 'USER',
        groupId: null,
      });
    });

    it('sem plano ou sem cota, a busca nem sai', async () => {
      const recusa = new AiPlanRequiredException({ tier: 'FREE' } as never);
      const { tool, buscar, record } = montar({
        acesso: async () => {
          throw recusa;
        },
      });

      await expect(tool.execute({ query: 'creatina' }, CTX)).rejects.toBe(recusa);
      expect(buscar).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it('a consulta que falhou no Brave não entra na conta', async () => {
      const { tool, record } = montar({
        falhaBrave: new ServiceUnavailableException('fora do ar'),
      });

      await expect(tool.execute({ query: 'creatina' }, CTX)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(record).not.toHaveBeenCalled();
    });
  });
});

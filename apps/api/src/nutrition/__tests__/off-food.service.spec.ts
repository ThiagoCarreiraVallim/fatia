import { OffFoodService, atribuicaoDoOff } from '../off-food.service';
import leiteCondensado from './fixtures/off-leite-condensado.json';
import naoEncontrado from './fixtures/off-nao-encontrado.json';

/**
 * Nenhum teste aqui chama o Open Food Facts de verdade — `fetch` é sempre
 * dublê, e as fixtures são respostas reais gravadas em disco.
 */

const CODIGO = '7891000100103';

function respostaJson(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

describe('OffFoodService', () => {
  let service: OffFoodService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new OffFoodService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    // O serviço loga aviso quando o OFF falha; sem isto o output do teste fica
    // poluído por falhas que são o próprio caso de teste.
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  describe('privacidade — o que sai daqui', () => {
    it('manda o código de barras e nada do usuário', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      await service.lookup(CODIGO);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain(`/api/v2/product/${CODIGO}.json`);

      // Nenhum cabeçalho de identidade. A lista é fechada de propósito: um
      // `Authorization` ou um cookie acrescentado por descuido vazaria a sessão
      // do usuário para um terceiro, e um teste que só checasse "tem
      // User-Agent" não veria isso.
      expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
        'Accept',
        'User-Agent',
      ]);
      expect((init.headers as Record<string, string>)['User-Agent']).toContain('Fatia/');

      // Sem corpo e sem cookie na requisição.
      expect(init.body).toBeUndefined();
      expect(init.credentials).toBeUndefined();
    });

    it('não anexa nada além do filtro de campos na query', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      await service.lookup(CODIGO);

      const url = new URL((fetchMock.mock.calls[0] as [string])[0]);
      expect([...url.searchParams.keys()]).toEqual(['fields']);
    });
  });

  describe('código inválido', () => {
    it.each(['abc', '123', '7891000100103456789', '789100010010a', ''])(
      'recusa %p sem chamar o OFF',
      async (codigo) => {
        const resultado = await service.lookup(codigo);
        expect(resultado.status).toBe('invalid_barcode');
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('recusa código com barra, que mudaria a URL chamada no terceiro', async () => {
      const resultado = await service.lookup('123/../../users/me');
      expect(resultado.status).toBe('invalid_barcode');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('consulta', () => {
    it('devolve o produto mapeado quando o OFF acha', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      const resultado = await service.lookup(CODIGO);

      expect(resultado.status).toBe('ok');
      if (resultado.status !== 'ok') return;
      expect(resultado.product.name).toBe('Leite Condensado Integral moça');
      expect(resultado.product.barcode).toBe(CODIGO);
    });

    it('devolve not_found quando o corpo vem com status 0', async () => {
      fetchMock.mockResolvedValue(respostaJson(naoEncontrado));

      const resultado = await service.lookup('7891962057014');

      expect(resultado.status).toBe('not_found');
    });

    it('devolve not_found no 404 do OFF', async () => {
      fetchMock.mockResolvedValue(respostaJson({}, 404));

      const resultado = await service.lookup('7891962057014');

      expect(resultado.status).toBe('not_found');
    });
  });

  describe('degradação — falha do OFF não pode travar a refeição', () => {
    it('timeout vira unavailable, não exceção', async () => {
      const abort = new Error('The operation was aborted due to timeout');
      abort.name = 'TimeoutError';
      fetchMock.mockRejectedValue(abort);

      await expect(service.lookup(CODIGO)).resolves.toEqual({ status: 'unavailable' });
    });

    it('rede fora vira unavailable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(service.lookup(CODIGO)).resolves.toEqual({ status: 'unavailable' });
    });

    it('5xx do OFF vira unavailable', async () => {
      fetchMock.mockResolvedValue(respostaJson({}, 503));

      await expect(service.lookup(CODIGO)).resolves.toEqual({ status: 'unavailable' });
    });

    it('corpo que não é JSON vira unavailable', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response);

      await expect(service.lookup(CODIGO)).resolves.toEqual({ status: 'unavailable' });
    });

    it('não guarda a falha: a tentativa seguinte volta a chamar o OFF', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      fetchMock.mockResolvedValueOnce(respostaJson(leiteCondensado));

      await service.lookup(CODIGO);
      const segunda = await service.lookup(CODIGO);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(segunda.status).toBe('ok');
    });

    it('passa um timeout ao fetch — sem ele a câmera fica pendurada', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      await service.lookup(CODIGO);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('cache em memória', () => {
    it('a segunda leitura do mesmo código não vai à rede', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      const primeira = await service.lookup(CODIGO);
      const segunda = await service.lookup(CODIGO);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(segunda).toEqual(primeira);
    });

    it('código desconhecido também é lembrado, senão a câmera martela o OFF', async () => {
      fetchMock.mockResolvedValue(respostaJson(naoEncontrado));

      await service.lookup('7891962057014');
      await service.lookup('7891962057014');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('códigos diferentes não se confundem', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));

      await service.lookup(CODIGO);
      await service.lookup('7891910000197');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('a entrada expira e a consulta é refeita', async () => {
      fetchMock.mockResolvedValue(respostaJson(leiteCondensado));
      const agora = Date.now();
      const relogio = jest.spyOn(Date, 'now').mockReturnValue(agora);

      await service.lookup(CODIGO);
      relogio.mockReturnValue(agora + 7 * 60 * 60 * 1000);
      await service.lookup(CODIGO);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('atribuicaoDoOff', () => {
  it('aponta para a página do produto na base de origem', () => {
    // Sem a URL do produto a atribuição da ODbL vira um rótulo genérico, e quem
    // vê o dado não consegue chegar na fonte para corrigi-lo.
    expect(atribuicaoDoOff(CODIGO)).toEqual({
      source: 'Open Food Facts',
      license: 'ODbL 1.0',
      url: `https://world.openfoodfacts.org/product/${CODIGO}`,
    });
  });
});

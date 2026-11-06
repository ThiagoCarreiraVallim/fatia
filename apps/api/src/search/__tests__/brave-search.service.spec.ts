import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { BraveSearchService } from '../brave-search.service';
import bigMac from './fixtures/brave-big-mac.json';
import creatina from './fixtures/brave-creatina.json';

/**
 * Nenhum caso aqui chama o Brave de verdade — `fetch` é sempre dublê, e as duas
 * fixtures são respostas **reais** gravadas em disco, com `result_filter=web`
 * ligado, exatamente como o serviço as pede.
 *
 * Gravar em vez de inventar não é preciosismo: a primeira chamada real recusou
 * `search_lang=pt` com 422 (o enum do Brave separa `pt-br` de `pt-pt`), as
 * descrições vêm com `<strong>` embutido, e `page_age` falta em resultado que
 * `age` data mesmo assim. As três só apareceram porque a resposta é a de
 * verdade; um dublê escrito por mim teria as três erradas e passaria verde.
 */

const CHAVE = 'chave-da-instancia';

function configComChave(valor: string): ConfigService {
  return { get: (_nome: string, padrao: string) => valor ?? padrao } as unknown as ConfigService;
}

function respostaJson(corpo: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as unknown as Response;
}

describe('BraveSearchService', () => {
  let service: BraveSearchService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new BraveSearchService(configComChave(CHAVE));
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('privacidade — o que sai daqui', () => {
    it('manda a consulta e nada do usuário', async () => {
      fetchMock.mockResolvedValueOnce(respostaJson(bigMac));
      await service.buscar('calorias do Big Mac', 3);

      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.searchParams.get('q')).toBe('calorias do Big Mac');

      // Sem corpo, sem cookie, sem `Authorization`. O único header que
      // identifica alguém é a chave, que é da instância — não de quem perguntou.
      expect(init.body).toBeUndefined();
      expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
        'Accept',
        'X-Subscription-Token',
      ]);
      // E a URL inteira: um id de usuário que vazasse por um parâmetro novo não
      // seria pego olhando só `q`.
      expect([...url.searchParams.keys()].sort()).toEqual([
        'count',
        'country',
        'extra_snippets',
        'q',
        'result_filter',
        'search_lang',
        'ui_lang',
      ]);
    });

    it('não escreve a consulta no log quando o Brave falha', async () => {
      const aviso = jest.spyOn(service['logger'], 'warn');
      fetchMock.mockResolvedValueOnce(respostaJson({}, 500));

      await expect(service.buscar('sintomas de hipoglicemia', 3)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // "sintomas de …" é dado de saúde tanto quanto peso e refeição, e log é
      // um segundo lugar onde ele passaria a existir.
      const escrito = aviso.mock.calls.flat().join(' ');
      expect(escrito).not.toContain('hipoglicemia');
    });

    it('pede `pt-br`, que é o que a API aceita', async () => {
      // `pt` foi recusado com 422 e `code: VALIDATION` na chamada real. O caso
      // existe porque a diferença é invisível em revisão de código.
      fetchMock.mockResolvedValueOnce(respostaJson(bigMac));
      await service.buscar('oi', 3);

      const [url] = fetchMock.mock.calls[0] as [URL];
      expect(url.searchParams.get('search_lang')).toBe('pt-br');
    });
  });

  describe('o que volta para o modelo', () => {
    it('recorta título, URL e trecho da resposta real', async () => {
      fetchMock.mockResolvedValueOnce(respostaJson(bigMac));
      const resultados = await service.buscar('calorias do Big Mac', 3);

      expect(resultados).toHaveLength(3);
      expect(resultados[1]).toEqual({
        title: "Calorias em McDonald's Big Mac (e Fatos Nutricionais)",
        url: expect.stringContaining('fatsecret.com.br'),
        description: 'Existem 524 calorias em 1 porção.',
      });
    });

    it('tira o HTML que o Brave embute no trecho', async () => {
      // O trecho real vem como `<strong>Existem 524 calorias…</strong>`. Markup
      // no prompt é ruído que o modelo tende a copiar para a resposta.
      fetchMock.mockResolvedValueOnce(respostaJson(bigMac));
      const resultados = await service.buscar('calorias do Big Mac', 3);

      expect(resultados.map((r) => r.description).join(' ')).not.toMatch(/<\/?[a-z]/i);
    });

    it('traz a data só de quem tem `page_age`, na mesma resposta', async () => {
      // A fixture da creatina tem os dois casos juntos: o primeiro resultado não
      // é datado e os outros dois são. Ausente fica **fora** do objeto — data
      // inventada num estudo é pior que data nenhuma.
      fetchMock.mockResolvedValueOnce(respostaJson(creatina));
      const resultados = await service.buscar('creatina estudo 2025', 3);

      expect(resultados.map((r) => r.date)).toEqual([
        undefined,
        '2026-04-14T00:00:00',
        '2026-08-03T00:00:00',
      ]);
      expect('date' in resultados[0]).toBe(false);
    });

    it('usa `page_age` e não `age`, que é prosa', async () => {
      // `age` chega como "há 2 semanas" / "14 de abril de 2026": muda com o dia
      // em que a busca acontece, e não é ordenável. Este caso lê a fixture para
      // afirmar que o campo prosa existe e que nada dele saiu daqui.
      const cru = creatina.web.results[2] as { age?: string };
      expect(cru.age).toBeDefined();

      fetchMock.mockResolvedValueOnce(respostaJson(creatina));
      const resultados = await service.buscar('creatina estudo 2025', 3);
      expect(JSON.stringify(resultados)).not.toContain(cru.age);
    });

    it('resposta sem a chave `web` devolve lista vazia, não exceção', async () => {
      // Consulta que só casa com outras verticais volta assim, e o corpo do 422
      // veio sem `web` também. Derrubar aqui trocaria "não achei" por "o chat
      // caiu" — o payload é mínimo de propósito, é a ausência que se testa.
      fetchMock.mockResolvedValueOnce(respostaJson({ type: 'search', query: {} }));
      await expect(service.buscar('qualquer coisa', 3)).resolves.toEqual([]);
    });

    it('descarta resultado sem URL', async () => {
      // Sem URL não há o que citar, e um item vazio na lista faria o modelo
      // atribuir a afirmação a uma fonte que não existe.
      fetchMock.mockResolvedValueOnce(
        respostaJson({ web: { results: [{ title: 'sem link', description: 'nada' }] } }),
      );
      await expect(service.buscar('x', 3)).resolves.toEqual([]);
    });
  });

  describe('degradação', () => {
    it('sem chave, recusa com motivo e sem tocar a rede', async () => {
      const semChave = new BraveSearchService(configComChave(''));

      expect(semChave.disponivel).toBe(false);
      await expect(semChave.buscar('oi', 3)).rejects.toThrow(/não está configurada/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('429 tem mensagem própria — a ação de quem opera é outra', async () => {
      // "Tente de novo" seria falso: o plano gratuito conta numa janela de ~31
      // dias, então quem esbarra nisto esbarra até o mês virar.
      fetchMock.mockResolvedValueOnce(respostaJson({}, 429));
      await expect(service.buscar('oi', 3)).rejects.toThrow(/limite de consultas do plano/);
    });

    it('timeout vira recusa nomeada, não exceção crua', async () => {
      fetchMock.mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }),
      );
      await expect(service.buscar('oi', 3)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});

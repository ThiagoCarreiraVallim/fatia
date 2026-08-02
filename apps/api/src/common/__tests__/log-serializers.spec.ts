import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { req as reqPadrao } from 'pino-std-serializers';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serializeRequest, serializeResponse } from '../log-serializers';

/**
 * O log de request gravava o **Bearer do usuário em texto puro**.
 *
 * A causa não foi um descuido pontual: o `pino-http` só estava configurado com `transport`,
 * `level` e `autoLogging`, e o serializador padrão que ele usa nesse caso inclui `headers`
 * inteiro. O comportamento pronto de fábrica é errado para este produto, e nada no código
 * apontava isso.
 *
 * O primeiro caso deste arquivo é um **controle negativo**: ele exercita o serializador padrão
 * e exige que o token apareça. Sem ele, os outros casos provariam apenas que a nossa função faz
 * o que ela mesma diz — não que havia um vazamento real, nem que ele voltaria se alguém removesse
 * a configuração de `serializers`.
 */
describe('serializadores de log', () => {
  const TOKEN = 'Bearer eyJhbGciOiJSUzI1NiJ9.CARGA_SECRETA.assinatura';

  function fakeReq(url = '/api/nutrition/foods?search=whey&pesoKg=87.4') {
    return {
      id: 'req-1',
      method: 'GET',
      url,
      headers: {
        authorization: TOKEN,
        cookie: 'logtoSession=abc123',
        'x-api-key': 'chave-de-terceiro',
        'user-agent': 'Claude/1.0',
        'content-type': 'application/json',
        host: 'api.fat.ia.br',
      },
      socket: { remoteAddress: '203.0.113.7', remotePort: 443 },
    } as unknown as IncomingMessage;
  }

  it('controle negativo: o serializador PADRÃO do pino vaza o token', () => {
    // Se este caso um dia falhar, o pino mudou o default e a nossa justificativa mudou junto —
    // é hora de reler a decisão, não de apagar o teste.
    const saida = JSON.stringify(reqPadrao(fakeReq() as never));

    expect(saida).toContain('CARGA_SECRETA');
  });

  describe('request', () => {
    it('não deixa passar authorization, cookie nem chave de terceiro', () => {
      const saida = JSON.stringify(serializeRequest(fakeReq() as never));

      expect(saida).not.toContain('CARGA_SECRETA');
      expect(saida).not.toContain('Bearer');
      expect(saida).not.toContain('logtoSession');
      expect(saida).not.toContain('chave-de-terceiro');
    });

    it('descarta a query string, onde vive o termo de busca', () => {
      // Busca de alimento é dado de saúde. `?search=whey&pesoKg=87.4` no log é o mesmo
      // vazamento que o THREAT_MODEL já proíbe para input de tool.
      const saida = serializeRequest(fakeReq() as never);

      expect(saida.path).toBe('/api/nutrition/foods');
      expect(JSON.stringify(saida)).not.toContain('whey');
      expect(JSON.stringify(saida)).not.toContain('87.4');
    });

    it('é lista de permissão: header desconhecido não entra', () => {
      // O ponto do desenho. Com lista de bloqueio, um header novo que carregue segredo passa
      // até alguém lembrar de proibi-lo — e ninguém lembra.
      const req = fakeReq();
      (req.headers as Record<string, string>)['x-inventado-amanha'] = 'segredo-futuro';

      const saida = JSON.stringify(serializeRequest(req as never));

      expect(saida).not.toContain('segredo-futuro');
      expect(saida).not.toContain('x-inventado-amanha');
    });

    it('preserva o que serve para depurar', () => {
      const saida = serializeRequest(fakeReq() as never);

      expect(saida).toMatchObject({
        id: 'req-1',
        method: 'GET',
        path: '/api/nutrition/foods',
        remoteAddress: '203.0.113.7',
        headers: { 'user-agent': 'Claude/1.0', 'content-type': 'application/json' },
      });
    });

    it('aguenta request sem url e sem headers', () => {
      const nu = { headers: {}, socket: {} } as unknown as IncomingMessage;

      expect(() => serializeRequest(nu as never)).not.toThrow();
      expect(serializeRequest(nu as never).path).toBe('');
    });
  });

  describe('a fiação no módulo', () => {
    it('o LoggerModule usa estes serializadores', () => {
      // Os casos acima provam que a função está certa; nenhum deles prova que ela é **usada**.
      // Apagar a linha `serializers:` do `app.module.ts` devolve o default do pino e volta a
      // vazar o token — com os sete testes acima passando verde. Este caso é o que quebra.
      //
      // A busca é recortada ao bloco `pinoHttp` de propósito. A primeira versão deste teste
      // procurava `serializeRequest` no arquivo inteiro e passava mesmo com a fiação removida,
      // porque casava com a linha de `import`. Asserção que não distingue o certo do errado é
      // pior que teste nenhum, e esta quase entrou assim.
      const modulo = readFileSync(resolve(__dirname, '..', '..', 'app.module.ts'), 'utf8');
      const inicio = modulo.indexOf('pinoHttp:');
      const bloco = modulo.slice(inicio, modulo.indexOf('}),', inicio));

      expect(inicio).toBeGreaterThan(-1);
      expect(bloco).toMatch(/serializers:\s*\{/);
      expect(bloco).toMatch(/req:\s*serializeRequest/);
      expect(bloco).toMatch(/res:\s*serializeResponse/);
    });
  });

  describe('response', () => {
    it('não grava headers de resposta — é por onde sairia o set-cookie', () => {
      const res = {
        statusCode: 200,
        getHeaders: () => ({ 'set-cookie': 'logtoSession=abc123; HttpOnly' }),
      } as unknown as ServerResponse;

      const saida = JSON.stringify(serializeResponse(res));

      expect(saida).not.toContain('logtoSession');
      expect(JSON.parse(saida)).toEqual({ statusCode: 200 });
    });
  });
});

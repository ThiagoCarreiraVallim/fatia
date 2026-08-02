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

    it('corta no fragmento também, não só no `?`', () => {
      // `req.url` é o request-target cru. O Node aceita `GET /api/nutrition/foods#whey` e o
      // Express casa a rota pelo caminho antes do `#` — então cortar só no `?` deixaria uma
      // segunda porta para a mesma classe de dado.
      const saida = serializeRequest(fakeReq('/api/nutrition/foods#search=whey') as never);

      expect(saida.path).toBe('/api/nutrition/foods');
      expect(JSON.stringify(saida)).not.toContain('whey');
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

    it('não grava o IP de origem', () => {
      // Saiu na #39, quando o log passou a ser enviado ao Loki: IP é dado pessoal e ali fica
      // indexado num segundo store. E o ganho diagnóstico não existe — atrás do Traefik o valor
      // é o do proxy, igual em toda requisição. `telemetry-redaction.ts` já derruba
      // `client.address`/`network.peer.address` do span pelo mesmo motivo; deixar o IP aqui era
      // redigir a mesma informação numa camada e publicá-la na outra.
      const saida = serializeRequest(fakeReq() as never);

      expect(saida).not.toHaveProperty('remoteAddress');
      expect(JSON.stringify(saida)).not.toContain('203.0.113.7');
    });

    it('preserva o que serve para depurar', () => {
      const saida = serializeRequest(fakeReq() as never);

      expect(saida).toMatchObject({
        id: 'req-1',
        method: 'GET',
        path: '/api/nutrition/foods',
        headers: { 'user-agent': 'Claude/1.0', 'content-type': 'application/json' },
      });
    });

    it('aguenta request sem url e sem headers', () => {
      const nu = { headers: {}, socket: {} } as unknown as IncomingMessage;

      expect(() => serializeRequest(nu as never)).not.toThrow();
      expect(serializeRequest(nu as never).path).toBe('');
    });
  });

  describe('a fiação', () => {
    // Os casos acima provam que a função está certa; nenhum deles prova que ela é **usada**.
    // Apagar a linha `serializers:` devolve o default do pino e volta a vazar o token — com os
    // sete testes acima passando verde. Estes dois casos são o que quebra.
    //
    // A configuração saiu do `app.module.ts` e foi para `common/logging.ts` (#140), porque a
    // parte dela que existe por privacidade precisa ser exercitada por teste. A fiação virou
    // dois elos, e os dois são testados: o módulo tem de chamar `opcoesDoPinoHttp`, e
    // `opcoesDoPinoHttp` tem de instalar estes serializadores.
    //
    // A busca é recortada ao bloco de propósito. A primeira versão deste teste procurava
    // `serializeRequest` no arquivo inteiro e passava mesmo com a fiação removida, porque
    // casava com a linha de `import`. Asserção que não distingue o certo do errado é pior que
    // teste nenhum, e esta quase entrou assim.
    function ler(...caminho: string[]) {
      return readFileSync(resolve(__dirname, '..', '..', ...caminho), 'utf8');
    }

    it('o LoggerModule monta o pinoHttp por opcoesDoPinoHttp', () => {
      const modulo = ler('app.module.ts');
      const inicio = modulo.indexOf('pinoHttp:');
      const bloco = modulo.slice(inicio, modulo.indexOf('}),', inicio));

      expect(inicio).toBeGreaterThan(-1);
      expect(bloco).toMatch(/opcoesDoPinoHttp\(/);
    });

    it('opcoesDoPinoHttp instala estes serializadores', () => {
      const logging = ler('common', 'logging.ts');
      const inicio = logging.indexOf('export function opcoesDoPinoHttp');
      const bloco = logging.slice(inicio);

      expect(inicio).toBeGreaterThan(-1);
      expect(bloco).toMatch(/serializers:\s*\{/);
      // `req` passa por `serializarRequisicao`, que é `serializeRequest` mais a máscara do
      // código de barras (ver `logging.ts`); `res` é usado direto.
      expect(bloco).toMatch(/req:\s*serializarRequisicao/);
      expect(bloco).toMatch(/res:\s*serializeResponse/);
    });

    it('a lista de permissão existe num arquivo só', async () => {
      // O risco de ter dois arquivos: alguém reescreve o filtro de cabeçalhos em `logging.ts` e
      // as duas listas passam a divergir — a que divergir por último é a que vaza.
      //
      // Os comentários são removidos antes da checagem de propósito: a primeira versão deste
      // caso rodava `.not.toMatch(/authorization/)` sobre o fonte inteiro e ficava vermelha por
      // causa do **comentário** que cita o header — justamente o comentário que se quer ter.
      const logging = ler('common', 'logging.ts');
      const codigo = logging.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      expect(codigo).toMatch(/serializeRequest\(req\)/);
      expect(codigo).not.toMatch(/authorization|cookie|user-agent|content-type/i);

      // E o resultado é o mesmo objeto de cabeçalhos que `serializeRequest` produz.
      const { serializarRequisicao } = await import('../logging');
      const req = fakeReq('/api/nutrition/foods/barcode/7891000100103');

      expect(serializarRequisicao(req as never).headers).toEqual(
        serializeRequest(req as never).headers,
      );
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

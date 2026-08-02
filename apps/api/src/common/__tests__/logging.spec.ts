import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pinoHttp } from 'pino-http';
import {
  caminhoSemCodigoDeBarras,
  foraDoAccessLog,
  opcoesDoPinoHttp,
  serializarRequisicao,
} from '../logging';

/**
 * O código escaneado não pode chegar ao log (#140, `docs/DATA_RETENTION.md`).
 *
 * Os testes de ponta a ponta abaixo sobem um servidor de verdade e alimentam o `pino-http` com
 * **as opções que o `AppModule` usa**, porque o defeito original não estava em nenhuma linha
 * escrita à mão: estava no serializer padrão do `pino-http`, que despeja `url` e `headers` no
 * mesmo objeto. Conferir a configuração lendo não pega isso; conferir a linha que sai, pega.
 *
 * A divisão com `log-serializers.spec.ts`: lá ficam as regras genéricas (lista de permissão de
 * cabeçalhos, query string, resposta) e o controle negativo contra o padrão do pino; aqui, o que
 * é específico do código de barras e a linha que realmente sai pela configuração montada.
 */

const CODIGO = '7891000100103';
const COOKIE_DE_SESSAO = 'fatia_session=abc123';
const TOKEN = 'Bearer eyJhbGciOiJSUzI1NiJ9.CARGA_SECRETA.assinatura';

async function linhasDeLog(
  caminho: string,
  cabecalhos: Record<string, string> = {},
): Promise<string[]> {
  const linhas: string[] = [];
  const destino = {
    write(mensagem: string) {
      linhas.push(mensagem);
    },
  };

  // `production` para não cair no transport do `pino-pretty`, que escreveria
  // num worker em vez do destino acima.
  const registrar = pinoHttp(opcoesDoPinoHttp('production'), destino);

  let responder: () => void = () => {};
  const respondido = new Promise<void>((resolver) => {
    responder = resolver;
  });

  const servidor = createServer((req, res) => {
    registrar(req, res);
    // Inscrito depois do `pino-http`: os ouvintes de 'finish' rodam na ordem de
    // inscrição, então quando este roda a linha dele já foi escrita. Sem isso o
    // teste dependeria de um `setTimeout` chutado.
    res.on('finish', responder);
    res.end('ok');
  });

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const { port } = servidor.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}${caminho}`, { headers: cabecalhos });
  await respondido;
  await new Promise<void>((resolver) => servidor.close(() => resolver()));

  return linhas;
}

describe('a linha que sai pelas opções do AppModule', () => {
  it('não escreve linha nenhuma para a consulta por código de barras', async () => {
    const linhas = await linhasDeLog(`/api/nutrition/foods/barcode/${CODIGO}`, {
      cookie: COOKIE_DE_SESSAO,
      authorization: TOKEN,
    });

    expect(linhas).toHaveLength(0);
  });

  it('não vaza sessão nem token numa rota normal', async () => {
    // Este é o caso que fica vermelho se alguém tirar `serializers:` de `opcoesDoPinoHttp`:
    // o `pino-http` volta ao padrão e grava `headers` inteiro. Os testes de unidade de
    // `log-serializers.spec.ts` continuariam verdes, porque provam a função, não a fiação.
    const linhas = await linhasDeLog('/api/nutrition/meals', {
      cookie: COOKIE_DE_SESSAO,
      authorization: TOKEN,
    });

    const saida = linhas.join('');
    expect(saida).not.toContain('CARGA_SECRETA');
    expect(saida).not.toContain(COOKIE_DE_SESSAO);
  });

  it('continua registrando as rotas normais, com o caminho e o que serve para depurar', async () => {
    // A regra é sobre o dado sensível, não sobre desligar o access log: se os casos de cima
    // ficarem verdes por acidente (nada mais é logado), eles não provam nada.
    const linhas = await linhasDeLog('/api/nutrition/meals?date=2026-08-02');

    expect(linhas).toHaveLength(1);
    const linha = JSON.parse(linhas[0]);
    expect(linha.req.path).toBe('/api/nutrition/meals');
    // `remoteAddress` só chega aqui porque o serializer aceita o objeto que o
    // `wrapRequestSerializer` entrega (sem `socket`). Lido do `IncomingMessage` cru, seria
    // `undefined` em produção e ninguém notaria pelo teste de unidade.
    expect(linha.req.remoteAddress).toBe('127.0.0.1');
    // A query fica de fora — regra de #215, conferida aqui na linha real.
    expect(linhas[0]).not.toContain('2026-08-02');
  });

  it('mantém o healthcheck fora do log', async () => {
    expect(await linhasDeLog('/health')).toHaveLength(0);
  });
});

describe('máscara do código de barras', () => {
  it('o código está no PATH, que o serializer de #215 preserva — por isso a máscara fica', () => {
    // O serializer de `log-serializers.ts` descarta a query string inteira, e isso bastaria se
    // o código viesse em `?code=`. Ele vem como segmento do caminho. Sem a máscara, o valor
    // escaneado sairia inteiro no campo `path`.
    const serializado = serializarRequisicao({
      id: 'req-1',
      method: 'GET',
      url: `/api/nutrition/foods/barcode/${CODIGO}`,
      headers: { cookie: COOKIE_DE_SESSAO, authorization: TOKEN },
    });

    expect(serializado.path).toBe('/api/nutrition/foods/barcode/***');
    expect(JSON.stringify(serializado)).not.toContain(CODIGO);
  });

  it('a máscara vale também no caminho de erro, que o autoLogging.ignore não cobre', async () => {
    // `pino-http` inscreve `res.on('error', …)` FORA do `if (shouldLogSuccess)`, então a rota
    // ignorada ainda pode gerar linha. Aqui o serializer é chamado como o `pino-http` o chama
    // nesse caminho: com o objeto já serializado pelo padrão.
    const { req: reqPadrao } = await import('pino-std-serializers');
    const cru = {
      method: 'GET',
      url: `/api/nutrition/foods/barcode/${CODIGO}`,
      headers: { cookie: COOKIE_DE_SESSAO },
      socket: { remoteAddress: '203.0.113.7' },
    };

    const saida = JSON.stringify(serializarRequisicao(reqPadrao(cru as never) as never));

    expect(saida).not.toContain(CODIGO);
    expect(saida).toContain('***');
  });

  it('troca o código pelo marcador e não mexe em caminho de outra rota', () => {
    expect(caminhoSemCodigoDeBarras(`/api/nutrition/foods/barcode/${CODIGO}`)).toBe(
      '/api/nutrition/foods/barcode/***',
    );
    expect(caminhoSemCodigoDeBarras('/api/nutrition/foods/42')).toBe('/api/nutrition/foods/42');
    expect(caminhoSemCodigoDeBarras('/api/nutrition/meals')).toBe('/api/nutrition/meals');
  });
});

describe('foraDoAccessLog', () => {
  it('cobre healthcheck e consulta por código de barras', () => {
    expect(foraDoAccessLog('/health')).toBe(true);
    expect(foraDoAccessLog(`/api/nutrition/foods/barcode/${CODIGO}`)).toBe(true);
  });

  it('deixa as demais rotas passarem', () => {
    expect(foraDoAccessLog('/api/nutrition/meals')).toBe(false);
    expect(foraDoAccessLog('/api/nutrition/foods/42')).toBe(false);
    expect(foraDoAccessLog(undefined)).toBe(false);
  });
});

import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { RedactingSpanProcessor } from '../redacting-span-processor';

/**
 * Prova de ponta a ponta, dentro do SDK real: não basta a função de saneamento estar correta se
 * o span chegar ao exportador sem passar por ela. Aqui o exportador em memória faz o papel do
 * Tempo, e o que ele recebe é exatamente o que sairia do processo.
 *
 * Sem banco, sem rede.
 */
describe('RedactingSpanProcessor', () => {
  it('o exportador nunca vê a query string nem o cabeçalho de autorização', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new RedactingSpanProcessor(new SimpleSpanProcessor(exporter))],
    });

    const span = provider.getTracer('teste').startSpan('GET /api/nutrition/foods');
    span.setAttribute('http.request.method', 'GET');
    span.setAttribute('http.route', '/api/nutrition/foods');
    span.setAttribute('url.path', '/api/nutrition/foods');
    span.setAttribute('url.query', 'search=whey&peso=87.4');
    span.setAttribute('url.full', 'https://api.fat.ia.br/api/nutrition/foods?search=whey');
    span.setAttribute('http.request.header.authorization', 'Bearer token-de-verdade');
    span.end();

    const [exported] = exporter.getFinishedSpans();

    expect(exported).toBeDefined();
    expect(exported.attributes['url.query']).toBeUndefined();
    expect(exported.attributes['http.request.header.authorization']).toBeUndefined();
    expect(exported.attributes['url.full']).toBe('https://api.fat.ia.br/api/nutrition/foods');
    expect(exported.attributes['http.route']).toBe('/api/nutrition/foods');

    // Nenhum atributo do span exportado pode conter o valor sensível, em campo nenhum.
    const todosOsValores = JSON.stringify(exported.attributes);
    expect(todosOsValores).not.toContain('whey');
    expect(todosOsValores).not.toContain('87.4');
    expect(todosOsValores).not.toContain('token-de-verdade');

    await provider.shutdown();
  });

  it('não exporta `userId` porque nada o coloca no span — guarda contra regressão', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new RedactingSpanProcessor(new SimpleSpanProcessor(exporter))],
    });

    const span = provider.getTracer('teste').startSpan('mcp.tool');
    span.setAttribute('tool', 'log_meal');
    span.end();

    const [exported] = exporter.getFinishedSpans();
    const chaves = Object.keys(exported.attributes);

    expect(chaves.some((k) => /user.?id|enduser/i.test(k))).toBe(false);

    await provider.shutdown();
  });
});

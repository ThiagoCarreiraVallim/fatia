import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CUT_NAMES, CUTS, cutsOf } from '../cut-registry';
import { MIN_CELL } from '../aggregation.service';

/**
 * O invariante que sustenta a #160: **existe um caminho de agregação, e um só.**
 *
 * A seção "Ordem" da issue diz que construir o painel pago em paralelo aos
 * alertas produziria duas noções de anonimização no mesmo produto. A forma de
 * cumprir isso não é disciplina: é não haver segundo lugar onde suprimir. Este
 * spec falha se alguém abrir um.
 *
 * Os três modos de falha que ele cobre, todos silenciosos:
 *
 * - um service novo que consulta o Prisma e devolve número direto ao controller;
 * - um segundo limiar, com outro valor, em outro arquivo;
 * - um recorte registrado no catálogo que ninguém roteou — ou pior, roteado sem
 *   estar no catálogo.
 */

const INSIGHTS_SRC = resolve(__dirname, '..');

function producao(): string[] {
  return readdirSync(INSIGHTS_SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
    .sort();
}

const ARQUIVOS = producao();
const conteudo = (relativo: string) => readFileSync(join(INSIGHTS_SRC, relativo), 'utf8');

/**
 * O arquivo sem comentários.
 *
 * Necessário porque este módulo é documentado em prosa que **fala** de
 * `suppress`, de `where` e de filtro para explicar por que eles não estão lá —
 * e um scanner ingênuo reprovaria justamente o arquivo mais bem explicado. Pior:
 * a saída seria "remova o comentário", que é o oposto do que se quer.
 */
const codigo = (relativo: string) =>
  conteudo(relativo)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('um caminho de agregação, e um só', () => {
  it('varre o módulo', () => {
    expect(ARQUIVOS).toContain('insights.service.ts');
    expect(ARQUIVOS).toContain('behavior.service.ts');
  });

  it('só o insights.service.ts importa suppress', () => {
    // O `import` é a fronteira certa para medir: quem não importa não pode
    // chamar, e um `require` dinâmico apareceria no diff como o que é.
    const importadores = ARQUIVOS.filter(
      (arquivo) => arquivo !== 'aggregation.service.ts' && /\bsuppress\b/.test(codigo(arquivo)),
    );

    expect(importadores).toEqual(['insights.service.ts']);
  });

  it('o limiar mora num arquivo só', () => {
    const DEFINICAO =
      /(const|let|var|readonly)\s+\w*(MIN_CELL|minCell|minSample|limiar|threshold)/i;

    const definidores = ARQUIVOS.filter((arquivo) => DEFINICAO.test(codigo(arquivo)));

    // Um segundo limiar não quebra nada visivelmente: os dois painéis
    // continuam respondendo, com regras diferentes, e ninguém percebe até
    // alguém comparar as duas telas.
    expect(definidores).toEqual(['aggregation.service.ts']);
  });

  it('todo recorte do catálogo é roteado pelo despacho, e nenhum a mais', () => {
    const despacho = codigo('insights.service.ts');

    const roteados = [...despacho.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]).sort();

    expect(roteados).toEqual([...CUT_NAMES].sort());
  });

  it('o controller não conhece quem conta — só a fachada', () => {
    const controller = codigo('insights.controller.ts');

    // Se o controller puder chamar `EngagementService` direto, ele pode devolver
    // célula crua sem passar por `suppress()` — e o teste acima continuaria
    // verde, porque o import de `suppress` seguiria existindo na fachada.
    expect(controller).not.toMatch(/EngagementService|BehaviorService|RetentionService/);
    expect(controller).toMatch(/InsightsService/);
  });

  it('todo recorte pertence a pelo menos um painel', () => {
    // Recorte órfão é código de agregação sem rota — some do radar e envelhece
    // fora de qualquer teste de painel.
    for (const cut of CUT_NAMES) {
      expect([cut, CUTS[cut].panels.length]).not.toEqual([cut, 0]);
    }
    expect(cutsOf('retention').length).toBeGreaterThan(0);
    expect(cutsOf('behavior').length).toBeGreaterThan(0);
  });

  it('nenhum eixo é demográfico', () => {
    // O pedido "dá para ver por sexo?" é uma adição de duas linhas ao `CUTS`.
    // Aqui ela custa um teste vermelho e uma conversa.
    const DEMOGRAFICO = /(sex|gender|genero|gênero|age|idade|birth|nascimento|cep|bairro)/i;

    for (const cut of CUT_NAMES) {
      expect([cut, DEMOGRAFICO.test(CUTS[cut].axis)]).toEqual([cut, false]);
      expect([cut, DEMOGRAFICO.test(CUTS[cut].metric)]).toEqual([cut, false]);
    }
  });
});

describe('docs/AGGREGATION_POLICY.md × cut-registry.ts', () => {
  /**
   * A política é publicada como diferencial de confiança — e uma doc de
   * privacidade que descreve um sistema que não existe mais é pior que nenhuma.
   * Mesmo mecanismo de `permission-matrix.spec.ts`: a doc é parseada e
   * confrontada com o código nos dois sentidos.
   */
  const DOC = resolve(__dirname, '../../../../../docs/AGGREGATION_POLICY.md');
  const doc = readFileSync(DOC, 'utf8');

  const linhasDaTabela = doc
    .split('\n')
    .filter((linha) => /^\| `[a-z_]+`\s+\|/.test(linha))
    .map((linha) =>
      linha
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((celula) => celula.trim().replace(/`/g, '')),
    );

  it('parseia a tabela de recortes', () => {
    // Sem sanidade, um parser quebrado faria as comparações abaixo passarem
    // comparando lista vazia com lista vazia.
    expect(linhasDaTabela.length).toBe(CUT_NAMES.length);
  });

  it('a doc lista exatamente os recortes que existem', () => {
    expect(linhasDaTabela.map((linha) => linha[0]).sort()).toEqual([...CUT_NAMES].sort());
  });

  it.each(linhasDaTabela)('%s: eixo, métrica e painéis conferem', (cut, eixo, metrica, paineis) => {
    const spec = CUTS[cut as keyof typeof CUTS];
    expect([cut, spec.axis]).toEqual([cut, eixo]);
    expect([cut, spec.metric]).toEqual([cut, metrica]);
    expect([cut, [...spec.panels].sort().join(', ')]).toEqual([
      cut,
      paineis
        .split(',')
        .map((p) => p.trim())
        .sort()
        .join(', '),
    ]);
  });

  it('o limiar escrito na doc é o limiar do código', () => {
    // O número na prosa é o que a academia lê e o que um auditor confere.
    expect(doc).toContain(`MIN_CELL = ${MIN_CELL}`);
    expect(doc).toContain(`\`0 < n < ${MIN_CELL}\``);
  });
});

describe('as rotas do painel declaram as duas camadas', () => {
  const controller = conteudo('insights.controller.ts').split('\n');
  const VERBO = /^\s*@(?:Get|Post|Put|Patch|Delete)\('([^']*)'\)/;
  const ASSINATURA = /^\s{2}(?:async\s+)?[\w]+\s*\(/;

  /** Decorators entre o verbo HTTP e a assinatura do método. */
  function blocoDaRota(inicio: number): string[] {
    const bloco: string[] = [];
    for (let j = inicio + 1; j < controller.length && !ASSINATURA.test(controller[j]); j++) {
      bloco.push(controller[j]);
    }
    return bloco;
  }

  const rotas = controller
    .map((linha, i) => ({ linha, i }))
    .filter(({ linha }) => VERBO.test(linha))
    .map(({ linha, i }) => ({ caminho: VERBO.exec(linha)?.[1] ?? '', bloco: blocoDaRota(i) }));

  it('encontra as rotas', () => {
    expect(rotas.length).toBeGreaterThan(3);
  });

  it.each(rotas)('$caminho exige insights.read', ({ bloco }) => {
    expect(bloco.some((linha) => /@RequireGroupAction\('insights\.read'\)/.test(linha))).toBe(true);
  });

  it.each(rotas.filter((rota) => rota.caminho.startsWith('behavior')))(
    '$caminho exige o add-on pago',
    ({ bloco }) => {
      // O menu escondido com o endpoint aberto é o modo de falha padrão de
      // recurso pago. O guarda tem de estar na rota, não na tela.
      expect(bloco.some((linha) => /@UseGuards\(InsightsAddonGuard\)/.test(linha))).toBe(true);
    },
  );

  it('nenhuma rota do painel aceita filtro além do recorte e do período', () => {
    const dto = codigo('dto/insights.dto.ts');

    // Um campo a mais no DTO é um construtor de filtro nascendo. Dois campos, os
    // dois de lista fechada — e é isso que a #159 chamou de decisão anterior à
    // supressão.
    const campos = [...dto.matchAll(/^\s{2}(\w+)!?:/gm)].map((m) => m[1]);
    expect(campos.sort()).toEqual(['cut', 'period']);

    // Sem as linhas de `import`, que legitimamente têm `from`.
    const corpo = dto.replace(/^import .*$/gm, '');
    expect(corpo).not.toMatch(/\bwhere\b|\bfilter\b|\bfrom\b|groupBy|Record</);
  });
});

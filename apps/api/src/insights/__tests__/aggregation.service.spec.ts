import { MIN_CELL, suppress, type Cell } from '../aggregation.service';

/**
 * O teste que decide a #159.
 *
 * O caminho feliz aqui é irrelevante: qualquer implementação que compare `n` com
 * 5 passa nele. O que precisa ser provado é que a célula suprimida **não pode
 * ser recalculada por diferença** — porque suprimir uma célula sozinha, num
 * recorte cujo total é conhecido, não esconde absolutamente nada, e falha em
 * silêncio: a resposta mostra `SUPPRESSED` e o número continua lá, a uma
 * subtração de distância.
 */
describe('suppress — limiar', () => {
  it(`publica a célula com n = ${MIN_CELL} — o limiar é "menor que", não "menor ou igual"`, () => {
    const cells: Cell[] = [
      { key: 'a', n: 5, value: 50 },
      { key: 'b', n: 30, value: 300 },
      { key: 'c', n: 9, value: 90 },
    ];

    const { cells: saida } = suppress(cells);

    expect(saida.every((cell) => !cell.suppressed)).toBe(true);
    expect(saida[0]).toEqual({ key: 'a', n: 5, value: 50, suppressed: false });
  });

  it(`suprime a célula com n = ${MIN_CELL - 1}`, () => {
    const cells: Cell[] = [
      { key: 'a', n: 4, value: 9 },
      { key: 'b', n: 30, value: 300 },
      { key: 'c', n: 28, value: 280 },
    ];

    const { cells: saida } = suppress(cells);

    expect(saida[0]).toEqual({ key: 'a', n: null, value: null, suppressed: true });
  });

  it('publica o balde vazio como zero — não há ninguém a proteger', () => {
    const cells: Cell[] = [
      { key: 'seg', n: 12, value: 40 },
      { key: 'ter', n: 0, value: 0 },
      { key: 'qua', n: 9, value: 22 },
    ];

    const { cells: saida, insufficientSample } = suppress(cells);

    expect(saida[1]).toEqual({ key: 'ter', n: 0, value: 0, suppressed: false });
    expect(insufficientSample).toBe(false);
  });

  it('some com o `n` junto com o valor', () => {
    // `n` é a informação sensível do recorte pequeno: publicar `value: null` com
    // `n: 3` diz "há três pessoas nesta faixa", que é metade do que o limiar
    // recusou a dizer.
    const { cells } = suppress([
      { key: 'alto', n: 3, value: 3 },
      { key: 'baixo', n: 40, value: 40 },
    ]);

    const suprimidas = cells.filter((cell) => cell.suppressed);
    expect(suprimidas.length).toBeGreaterThanOrEqual(2);
    for (const cell of suprimidas) {
      expect(cell.n).toBeNull();
      expect(cell.value).toBeNull();
    }
  });
});

describe('suppress — supressão complementar (o vazamento por diferença)', () => {
  /**
   * Números concretos, e é a razão de este spec existir.
   *
   * Recorte `sessions_by_hour_band` de uma academia:
   *
   * | faixa  |  n | sessões |
   * | ------ | -- | ------- |
   * | manhã  | 20 |     140 |
   * | noite  | 18 |      96 |
   * | tarde  |  3 |      11 |
   *
   * Total de sessões: 247. Com supressão simples, `tarde` sai como `SUPPRESSED`
   * e quem tem os outros dois números faz `247 - 140 - 96 = 11` — o número que o
   * limiar recusou a publicar, recuperado exatamente, sobre um recorte de três
   * pessoas.
   */
  const RECORTE: Cell[] = [
    { key: 'manhã', n: 20, value: 140 },
    { key: 'noite', n: 18, value: 96 },
    { key: 'tarde', n: 3, value: 11 },
  ];
  const TOTAL = 247;

  it('não deixa a célula pequena ser recalculada pelo total menos as visíveis', () => {
    const { cells } = suppress(RECORTE);

    const visiveis = cells.filter((cell) => !cell.suppressed);
    const ocultas = cells.filter((cell) => cell.suppressed);

    // Duas ocultas: a de 3 pessoas e o complemento. O resíduo é a soma das duas,
    // e não a segunda parcela de uma subtração com uma incógnita só.
    expect(ocultas).toHaveLength(2);

    const residuo = TOTAL - visiveis.reduce((soma, cell) => soma + (cell.value ?? 0), 0);
    expect(residuo).toBe(107); // 11 + 96, indivisível a partir da resposta
    expect(residuo).not.toBe(11);

    // E o número suprimido não pode estar em lugar nenhum da resposta.
    expect(JSON.stringify(cells)).not.toContain('11');
  });

  it('o complemento é a MENOR célula visível com gente', () => {
    const { cells } = suppress(RECORTE);

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('tarde')?.suppressed).toBe(true);
    // 18 < 20: `noite` cai junto, `manhã` sobrevive e o painel ainda informa.
    expect(porChave.get('noite')?.suppressed).toBe(true);
    expect(porChave.get('manhã')?.suppressed).toBe(false);
  });

  it('para quando já há duas suprimidas — não devora o recorte inteiro', () => {
    const { cells } = suppress([
      { key: 'a', n: 20, value: 200 },
      { key: 'b', n: 3, value: 7 },
      { key: 'c', n: 2, value: 4 },
    ]);

    expect(cells.filter((cell) => cell.suppressed).map((cell) => cell.key)).toEqual(['b', 'c']);
  });

  it('não usa balde vazio como complemento — seria teatro', () => {
    // Zero é um valor **conhecido**. Suprimir a coluna vazia ao lado da coluna
    // pequena mantém a subtração funcionando com uma incógnita só.
    const { cells, insufficientSample } = suppress([
      { key: 'cheia', n: 40, value: 400 },
      { key: 'pequena', n: 4, value: 12 },
      { key: 'vazia', n: 0, value: 0 },
    ]);

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('cheia')?.suppressed).toBe(true);
    // O balde vazio continua publicado — zero não é segredo de ninguém —, mas
    // ele não conta como amostra: o recorte inteiro vira "amostra insuficiente"
    // porque não sobrou nenhuma célula **com gente** visível.
    expect(porChave.get('vazia')?.suppressed).toBe(false);
    expect(insufficientSample).toBe(true);
  });

  it('suprime o recorte inteiro quando não há complemento elegível', () => {
    const { cells, insufficientSample } = suppress([
      { key: 'única', n: 3, value: 11 },
      { key: 'vazia', n: 0, value: 0 },
    ]);

    expect(cells.every((cell) => cell.suppressed)).toBe(true);
    expect(insufficientSample).toBe(true);
    expect(JSON.stringify(cells)).not.toContain('11');
  });

  it('recorte de célula única e pequena responde SUPPRESSED, nunca 0', () => {
    const { cells, insufficientSample } = suppress([{ key: 'total', n: 2, value: 6 }]);

    expect(insufficientSample).toBe(true);
    expect(cells[0].value).toBeNull();
    // O erro que este caso fecha: devolver `0` para "não posso dizer" é uma
    // afirmação sobre as pessoas, e é falsa.
    expect(cells[0].value).not.toBe(0);
  });

  it('é determinístico no empate — duas chamadas iguais não revelam duas células', () => {
    const empate: Cell[] = [
      { key: 'b', n: 9, value: 30 },
      { key: 'a', n: 9, value: 31 },
      { key: 'c', n: 4, value: 8 },
    ];

    const primeira = suppress(empate).cells.map((cell) => cell.suppressed);
    const segunda = suppress(empate).cells.map((cell) => cell.suppressed);

    expect(primeira).toEqual(segunda);
    // Desempate pela chave: `a` cai, `b` fica. Sem regra estável, uma chamada
    // esconderia `a` e a outra `b`, e quem fizesse as duas veria as duas.
    expect(suppress(empate).cells.find((cell) => cell.key === 'a')?.suppressed).toBe(true);
  });
});

describe('suppress — propriedade sobre distribuições aleatórias', () => {
  /**
   * Gerador determinístico (LCG): 1.000 distribuições, sempre as mesmas. Teste
   * de propriedade que muda de entrada a cada rodada falha em dias aleatórios e
   * é desligado na terceira vez.
   */
  function* aleatorio(semente: number): Generator<number> {
    let estado = semente;
    for (;;) {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      yield estado / 4_294_967_296;
    }
  }

  it('em 1.000 recortes, nenhum valor oculto sai do total menos as visíveis', () => {
    const rng = aleatorio(20260803);
    const proximo = () => rng.next().value as number;

    let comOculta = 0;
    let comVisivelEOculta = 0;

    for (let rodada = 0; rodada < 1000; rodada++) {
      const quantas = 2 + Math.floor(proximo() * 7);
      const cells: Cell[] = Array.from({ length: quantas }, (_, i) => {
        const n = Math.floor(proximo() * 12); // 0..11 — cruza o limiar nos dois lados
        // Métrica de contagem: quem aparece registra ao menos uma vez.
        const value = n === 0 ? 0 : n + Math.floor(proximo() * 20);
        return { key: `k${String(i).padStart(2, '0')}`, n, value };
      });

      const total = cells.reduce((soma, cell) => soma + cell.value, 0);
      const { cells: saida, insufficientSample } = suppress(cells);

      const ocultas = saida.filter((cell) => cell.suppressed);
      const visiveis = saida.filter((cell) => !cell.suppressed);

      // 1. Nunca exatamente uma oculta: uma oculta é uma equação com uma incógnita.
      expect(ocultas.length).not.toBe(1);
      if (ocultas.length > 0) comOculta++;

      // 2. Nenhuma célula abaixo do limiar sobrou visível.
      for (const cell of visiveis) {
        expect(cell.n === 0 || (cell.n ?? 0) >= MIN_CELL).toBe(true);
      }

      // 3. O ataque: com o total sabido de fora, o resíduo não isola ninguém.
      if (!insufficientSample && ocultas.length > 0) {
        comVisivelEOculta++;
        const residuo = total - visiveis.reduce((soma, cell) => soma + (cell.value ?? 0), 0);
        const originaisOcultas = cells.filter((_, i) => saida[i].suppressed);
        for (const original of originaisOcultas) {
          expect(residuo).not.toBe(original.value);
        }
      }
    }

    // Sanidade — sem isto, um `suppress` que nunca suprimisse passaria em todos
    // os `expect` acima comparando nada com nada. Foi assim que um teste bom
    // apodreceu neste repositório antes.
    expect(comOculta).toBeGreaterThan(500);
    expect(comVisivelEOculta).toBeGreaterThan(300);
  });
});

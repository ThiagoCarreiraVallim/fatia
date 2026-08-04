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

  it('o complemento é o VIZINHO no eixo, não a menor célula visível', () => {
    const { cells } = suppress(RECORTE);

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('tarde')?.suppressed).toBe(true);
    // `tarde` é a última do eixo, então o bloco cresce para a esquerda e leva
    // `noite`. `manhã` sobrevive e o painel ainda informa.
    expect(porChave.get('noite')?.suppressed).toBe(true);
    expect(porChave.get('manhã')?.suppressed).toBe(false);
  });

  it('o bloco cresce para a DIREITA quando há eixo à direita', () => {
    // A direção não é gosto: é o que torna o complemento independente da janela
    // consultada (as três janelas terminam no mesmo instante). Aqui a menor
    // célula visível é `c` (n = 6), e é `b` que cai — porque `b` é o vizinho.
    const { cells } = suppress([
      { key: 'a', n: 3, value: 9 },
      { key: 'b', n: 40, value: 400 },
      { key: 'c', n: 6, value: 30 },
    ]);

    const porChave = new Map(cells.map((cell) => [cell.key, cell]));
    expect(porChave.get('a')?.suppressed).toBe(true);
    expect(porChave.get('b')?.suppressed).toBe(true);
    expect(porChave.get('c')?.suppressed).toBe(false);
  });

  it('para quando o bloco fica seguro — não devora o recorte inteiro', () => {
    const { cells } = suppress([
      { key: 'a', n: 20, value: 200 },
      { key: 'b', n: 3, value: 7 },
      { key: 'c', n: 2, value: 4 },
    ]);

    expect(cells.filter((cell) => cell.suppressed).map((cell) => cell.key)).toEqual(['b', 'c']);
  });

  it('duas células pequenas que se bastam NÃO se bastam — 1 + 1 devolve as duas', () => {
    // O furo que a revisão exibiu. Com a regra antiga ("complementa só quando
    // sobra exatamente uma oculta"), estas duas caíam sozinhas e o resíduo do
    // total valia 2, sobre duas parcelas de no mínimo 1 cada: cada uma vale 1, e
    // `n <= value` com `n >= 1` fecha em `n = 1`. Duas pessoas publicadas por
    // subtração, cada uma sozinha na sua célula.
    //
    // O total (182) não sai deste recorte: sai de `sessions_by_week`, que
    // particiona exatamente as mesmas sessões.
    const TOTAL = 182;
    const { cells } = suppress([
      { key: 'madrugada', n: 1, value: 1 },
      { key: 'manhã', n: 1, value: 1 },
      { key: 'tarde', n: 20, value: 100 },
      { key: 'noite', n: 15, value: 80 },
    ]);

    const ocultas = cells.filter((cell) => cell.suppressed);
    const visiveis = cells.filter((cell) => !cell.suppressed);

    // O bloco cresceu para a direita até esconder gente de verdade.
    expect(ocultas.map((cell) => cell.key)).toEqual(['madrugada', 'manhã', 'tarde']);

    const residuo = TOTAL - visiveis.reduce((soma, cell) => soma + (cell.value ?? 0), 0);
    expect(residuo).toBe(102);
    // Três incógnitas, e a folga do intervalo é larga: cada parcela pode valer
    // de 1 a 100. O valor `1` não é mais uma resposta, é um palpite.
    expect(residuo - ocultas.length).toBeGreaterThanOrEqual(MIN_CELL);
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
    // `c` é a última do eixo; o bloco cresce para a esquerda e leva `a`, que é a
    // vizinha — o empate de `n` entre `a` e `b` nem chega a ser consultado.
    // Sem regra estável, uma chamada esconderia uma e a outra chamada a outra, e
    // quem fizesse as duas veria as duas.
    expect(suppress(empate).cells.find((cell) => cell.key === 'a')?.suppressed).toBe(true);
    expect(suppress(empate).cells.find((cell) => cell.key === 'b')?.suppressed).toBe(false);
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
        const comGente = originaisOcultas.filter((cell) => cell.n > 0);

        // A asserção que estava aqui — `expect(residuo).not.toBe(original.value)`
        // — era **inatingível por construção** quando havia duas ocultas: o
        // resíduo é a soma delas e o gerador garante `value >= 1` em toda célula
        // com gente, então a soma nunca é igual a uma parcela. Mil distribuições
        // e zero poder de detecção justamente na classe que estava quebrada.
        //
        // O que precisa ser verdade é mais forte: o resíduo tem de admitir
        // **mais de uma** decomposição para cada célula oculta. Com `k` parcelas
        // de no mínimo 1, o valor de cada uma vai de 1 a `residuo - (k - 1)`;
        // largura zero significa que todas valem 1 e estão publicadas.
        expect(comGente.length).not.toBe(1);
        expect(residuo - comGente.length).toBeGreaterThanOrEqual(MIN_CELL);

        // E o teste direto do ataque: nenhuma célula oculta pode ser o único
        // valor possível para a posição dela.
        for (const original of comGente) {
          const menorPossivel = 1;
          const maiorPossivel = residuo - (comGente.length - 1);
          expect(maiorPossivel).toBeGreaterThan(menorPossivel);
          expect(original.value).toBeGreaterThanOrEqual(menorPossivel);
          expect(original.value).toBeLessThanOrEqual(maiorPossivel);
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

/**
 * O bloqueio central da revisão: a supressão tem de ser a **mesma** nas três
 * janelas.
 *
 * Os períodos nomeados são encaixados — `last_90_days` ⊂ `last_12_months` — e o
 * balde de um recorte de tempo é o mesmo objeto nos dois: a semana só contém as
 * sessões daquela semana. Com o complemento escolhido como "a menor célula
 * visível **desta consulta**", ele mudava de janela para janela, e a segunda
 * requisição publicava exatamente o balde que a primeira havia escondido.
 * Restava uma incógnita só, e o total vinha de um recorte irmão sobre a mesma
 * população (`sessions_by_hour_band` particiona as mesmas sessões que
 * `sessions_by_week`).
 *
 * O ataque inteiro cabia em três GETs do painel **gratuito**, sem construtor de
 * filtro nenhum.
 */
describe('suppress — a mesma célula oculta nas três janelas encaixadas', () => {
  /** Uma série semanal; a janela curta é o sufixo da longa (as duas terminam hoje). */
  function serie(semanas: number, semente: number): Cell[] {
    let estado = semente;
    const proximo = () => {
      estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return estado / 4_294_967_296;
    };

    return Array.from({ length: semanas }, (_, i) => {
      const n = Math.floor(proximo() * 14);
      return { key: `s${String(i).padStart(2, '0')}`, n, value: n === 0 ? 0 : n + 5 };
    });
  }

  const ocultasDe = (cells: Cell[]) =>
    new Set(
      suppress(cells)
        .cells.filter((cell) => cell.suppressed)
        .map((cell) => cell.key),
    );

  it('o caso concreto da revisão: o balde escondido em 90 dias não sai em 12 meses', () => {
    // `sessions_by_week`. A janela longa vê 52 semanas; a curta vê as 13 últimas.
    // `s51` (a semana de 3 pessoas) é o alvo, e `s50` era o complemento na janela
    // curta — publicado na longa porque lá havia semana menor para escolher.
    const longa: Cell[] = [
      ...Array.from({ length: 39 }, (_, i) => ({
        key: `o${String(i).padStart(2, '0')}`,
        n: i === 20 ? 2 : 30,
        value: i === 20 ? 4 : 120,
      })),
      ...Array.from({ length: 11 }, (_, i) => ({
        key: `s${String(i + 39).padStart(2, '0')}`,
        n: 25,
        value: 100,
      })),
      { key: 's50', n: 8, value: 25 },
      { key: 's51', n: 3, value: 11 },
    ];
    const curta = longa.slice(39);

    const ocultasCurta = ocultasDe(curta);
    const ocultasLonga = ocultasDe(longa);

    expect(ocultasCurta.has('s51')).toBe(true);
    // O complemento da janela curta. Se ele sair publicado na janela longa, o
    // resíduo da curta fica com uma incógnita só e `s51` volta inteiro.
    expect(ocultasCurta.has('s50')).toBe(true);
    expect(ocultasLonga.has('s50')).toBe(true);
    expect(ocultasLonga.has('s51')).toBe(true);
  });

  it('em 300 séries, nada oculto na janela curta é publicado na janela longa', () => {
    let comOcultaNaCurta = 0;

    for (let rodada = 0; rodada < 300; rodada++) {
      const longa = serie(52, 20260804 + rodada);
      const curta = longa.slice(39); // mesmas 13 últimas semanas, mesmos valores

      const resultadoCurta = suppress(curta);
      // Janela curta que suprime tudo não publica nada, e o que não é publicado
      // não entra em subtração nenhuma. É o modo de falha seguro, não o vazamento.
      if (resultadoCurta.cells.every((cell) => cell.suppressed)) continue;

      const publicadaNaLonga = new Set(
        suppress(longa)
          .cells.filter((cell) => !cell.suppressed)
          .map((cell) => cell.key),
      );
      const ocultasCurta = ocultasDe(curta);
      if (ocultasCurta.size > 0) comOcultaNaCurta++;

      for (const chave of ocultasCurta) {
        // A janela longa não pode desfazer a supressão da curta.
        expect([rodada, chave, publicadaNaLonga.has(chave)]).toEqual([rodada, chave, false]);
      }
    }

    expect(comOcultaNaCurta).toBeGreaterThan(150);
  });
});

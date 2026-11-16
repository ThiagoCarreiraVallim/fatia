import {
  BLOCK_TEMPLATE,
  BLOCK_WEEKS_TOTAL,
  MAX_BLOCK_WEEKS,
  MIN_BLOCK_WEEKS,
  REP_RANGE_BY_KIND,
  blockTemplate,
  describeWeek,
  weekLabel,
} from '../helpers/block-template';

describe('block-template', () => {
  it('tem exatamente as quatro semanas do bloco, na ordem', () => {
    expect(BLOCK_TEMPLATE.map((w) => w.weekNumber)).toEqual([1, 2, 3, 4]);
    expect(BLOCK_TEMPLATE).toHaveLength(BLOCK_WEEKS_TOTAL);
  });

  it('grava os fatores da tabela, não uma aproximação', () => {
    // Os números são a decisão, não detalhe de implementação: mudá-los muda a
    // carga de quem está treinando. Se um dia mudarem, é para este caso cair e a
    // mudança ser deliberada.
    expect(BLOCK_TEMPLATE.map((w) => [w.focus, w.intensityFactor, w.volumeFactor])).toEqual([
      ['accumulation', 1.0, 1.0],
      ['accumulation', 1.025, 1.2],
      ['peak', 1.05, 1.0],
      ['deload', 0.85, 0.5],
    ]);
  });

  it('tem uma única semana de deload, e é a última', () => {
    const deload = BLOCK_TEMPLATE.filter((w) => w.focus === 'deload');
    expect(deload.map((w) => w.weekNumber)).toEqual([BLOCK_WEEKS_TOTAL]);
  });

  it('só desce a intensidade no deload', () => {
    const abaixoDeUm = BLOCK_TEMPLATE.filter((w) => w.intensityFactor < 1).map((w) => w.focus);
    expect(abaixoDeUm).toEqual(['deload']);
  });

  it('separa strength de hypertrophy só pela faixa de repetições', () => {
    expect(REP_RANGE_BY_KIND).toEqual({ strength: '4-6', hypertrophy: '8-12' });
  });

  describe('describeWeek', () => {
    it('diz semana, foco e o que muda em relação à prescrição', () => {
      // `+2,5%`, e não `+2%`: `(1.025 - 1) * 100` dá 2,4999999999999998 em ponto
      // flutuante, e arredondar para inteiro faria a tela mostrar um número que
      // não é o do template.
      expect(describeWeek(BLOCK_TEMPLATE[1])).toBe(
        'Semana 2 de 4 — acúmulo: carga +2,5%, volume +20%.',
      );
    });

    it('não inventa variação quando os fatores são neutros', () => {
      expect(describeWeek(BLOCK_TEMPLATE[0])).toBe(
        'Semana 1 de 4 — acúmulo: carga da sua prescrição, volume normal.',
      );
    });

    it('diz que a carga cai no deload, com sinal', () => {
      // Asserção na frase inteira, e não `toContain('-15')`: `toContain` casa
      // substring e passaria com "carga -150%".
      expect(describeWeek(BLOCK_TEMPLATE[3])).toBe(
        'Semana 4 de 4 — deload: carga -15%, volume -50%.',
      );
    });
  });

  describe('blockTemplate (3 a 6 semanas, #379)', () => {
    const focos = (n: number) => blockTemplate(n).map((w) => w.focus);

    it('o bloco de 4 semanas continua sendo a tabela de antes, número por número', () => {
      expect(blockTemplate(4)).toEqual(BLOCK_TEMPLATE);
    });

    it('3 semanas: acúmulo, pico, deload', () => {
      expect(focos(3)).toEqual(['accumulation', 'peak', 'deload']);
    });

    it('5 semanas: dois de acúmulo, dois de pico, deload', () => {
      expect(focos(5)).toEqual(['accumulation', 'accumulation', 'peak', 'peak', 'deload']);
    });

    it('6 semanas: três de acúmulo, dois de pico, deload', () => {
      expect(focos(6)).toEqual([
        'accumulation',
        'accumulation',
        'accumulation',
        'peak',
        'peak',
        'deload',
      ]);
    });

    it('a carga sobe semana a semana até o pico e só cai no deload', () => {
      for (let n = MIN_BLOCK_WEEKS; n <= MAX_BLOCK_WEEKS; n++) {
        const semanas = blockTemplate(n);
        expect(semanas.map((w) => w.weekNumber)).toEqual(
          Array.from({ length: n }, (_, i) => i + 1),
        );
        const treino = semanas.slice(0, -1).map((w) => w.intensityFactor);
        expect([...treino].sort((a, b) => a - b)).toEqual(treino);
        expect(semanas.at(-1)).toMatchObject({
          focus: 'deload',
          intensityFactor: 0.85,
          volumeFactor: 0.5,
        });
        expect(semanas.filter((w) => w.focus === 'deload')).toHaveLength(1);
      }
    });

    it('6 semanas: os fatores exatos', () => {
      expect(blockTemplate(6).map((w) => [w.intensityFactor, w.volumeFactor])).toEqual([
        [1.0, 1.0],
        [1.025, 1.1],
        [1.05, 1.2],
        [1.075, 1.0],
        [1.1, 1.0],
        [0.85, 0.5],
      ]);
    });

    it('recusa fora de 3 a 6', () => {
      expect(() => blockTemplate(2)).toThrow();
      expect(() => blockTemplate(7)).toThrow();
      expect(() => blockTemplate(4.5)).toThrow();
    });

    it('a frase usa o total do bloco, não 4', () => {
      expect(describeWeek(blockTemplate(6)[5], 6)).toBe(
        'Semana 6 de 6 — deload: carga -15%, volume -50%.',
      );
    });

    it('o rótulo numera o foco repetido', () => {
      const n6 = blockTemplate(6);
      expect(n6.map((w) => weekLabel(w, n6))).toEqual([
        'Acúmulo 1',
        'Acúmulo 2',
        'Acúmulo 3',
        'Pico 1',
        'Pico 2',
        'Deload',
      ]);
      const n3 = blockTemplate(3);
      expect(n3.map((w) => weekLabel(w, n3))).toEqual(['Acúmulo', 'Pico', 'Deload']);
    });
  });
});

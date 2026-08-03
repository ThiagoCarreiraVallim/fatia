import {
  BLOCK_TEMPLATE,
  BLOCK_WEEKS_TOTAL,
  REP_RANGE_BY_KIND,
  describeWeek,
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
});

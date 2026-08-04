import { estimateAiCost, parseAiPriceTable, type AiPriceTable } from '../ai-pricing';

/**
 * Medição de custo de IA hospedada (issue #135).
 *
 * O modo de falha que estes casos existem para prender não é um erro de conta — é **custo zero em
 * silêncio**. Toda vez que a informação falta (modelo fora da tabela, `usage` ausente na resposta),
 * a saída mais natural em JavaScript é `0`, e `0` é indistinguível de "foi de graça". A fatura
 * chega semanas depois, sem nada apontando de onde veio.
 */

// US$ 3,00 por milhão de tokens de entrada e US$ 15,00 de saída, em micro-dólares. É a escala
// real de um modelo de gateway, e não um número redondo inventado: a conta abaixo só fecha se a
// unidade estiver certa.
const TABELA: AiPriceTable = {
  'gateway/modelo-pago': { in: 3_000_000, out: 15_000_000 },
  // US$ 0,15 / US$ 0,40 por milhão — a faixa de um modelo pequeno. Preços que não são múltiplos de
  // um milhão são os únicos que produzem fração, e é por isso que este existe: sem ele, arredondar
  // uma vez e arredondar duas dão sempre o mesmo número e o caso abaixo seria vacuoso.
  'gateway/modelo-barato': { in: 150_000, out: 400_000 },
  // US$ 6,00 por milhão de **segundos** — a unidade de transcrição (#141). Está aqui porque a
  // duração de um áudio é fracionária, e o caso fracionário precisa de um preço que não seja
  // múltiplo de 1.000.000 para a conta distinguir uma fórmula da outra.
  'gateway/audio': { in: 6_000_000, out: 0 },
  'local/gemma': { in: 0, out: 0 },
};

describe('parseAiPriceTable', () => {
  it('aceita vazio como tabela vazia — instância sem IA hospedada é o normal', () => {
    expect(parseAiPriceTable('')).toEqual({});
    expect(parseAiPriceTable('   ')).toEqual({});
  });

  it('lê a tabela do ambiente', () => {
    expect(parseAiPriceTable('{"m":{"in":3000000,"out":15000000}}')).toEqual({
      m: { in: 3_000_000, out: 15_000_000 },
    });
  });

  it('falha com JSON quebrado, dizendo o formato esperado', () => {
    // Uma vírgula sobrando é o erro real de quem edita env pelo painel.
    expect(() => parseAiPriceTable('{"m":{"in":1,"out":2},}')).toThrow(/AI_PRICE_TABLE não é JSON/);
    expect(() => parseAiPriceTable('{"m":{"in":1,"out":2},}')).toThrow(/micro-unidades/);
  });

  it.each([
    ['preço sem "out"', '{"m":{"in":1}}'],
    ['preço fracionário', '{"m":{"in":1.5,"out":2}}'],
    ['preço negativo', '{"m":{"in":-1,"out":2}}'],
    ['valor que não é objeto', '{"m":3}'],
  ])('falha na forma inválida: %s', (_caso, raw) => {
    expect(() => parseAiPriceTable(raw)).toThrow(/AI_PRICE_TABLE tem forma inválida/);
  });

  it('nomeia o campo culpado, não só "inválido"', () => {
    // Sem o caminho na mensagem, quem opera reabre o painel e olha a linha inteira.
    expect(() => parseAiPriceTable('{"m":{"in":1,"out":-2}}')).toThrow(/m\.out/);
  });
});

describe('estimateAiCost', () => {
  it('multiplica unidades pelo preço, na escala de micro-unidades por milhão', () => {
    // 1.000 tokens de entrada a US$ 3/M = US$ 0,003 = 3.000 micro-dólares.
    // 500 de saída a US$ 15/M = US$ 0,0075 = 7.500. Total 10.500.
    expect(
      estimateAiCost('gateway/modelo-pago', { inputUnits: 1_000, outputUnits: 500 }, TABELA),
    ).toEqual({ costMicros: 10_500, pricingKnown: true });
  });

  it('modelo local com preço 0 declarado custa 0 e o preço é CONHECIDO', () => {
    // Este é o caso que dá sentido ao `pricingKnown`: mesmo custo do modelo ausente, significado
    // oposto. Aqui alguém declarou que é grátis.
    expect(estimateAiCost('local/gemma', { inputUnits: 900, outputUnits: 900 }, TABELA)).toEqual({
      costMicros: 0,
      pricingKnown: true,
    });
  });

  it('modelo fora da tabela não vira gratuidade em silêncio', () => {
    // Trocar AI_MODEL_VISION no painel sem mexer no preço. Sem `pricingKnown: false`, o mês
    // inteiro entraria como custo zero.
    expect(
      estimateAiCost('modelo/trocado-no-painel', { inputUnits: 5_000, outputUnits: 5_000 }, TABELA),
    ).toEqual({ costMicros: 0, pricingKnown: false });
  });

  it.each([
    ['usage inteiramente ausente', {}],
    ['só entrada reportada', { inputUnits: 1_000 }],
    ['só saída reportada', { outputUnits: 1_000 }],
  ])('%s marca o preço como desconhecido, não como zero', (_caso, units) => {
    // Acontece de verdade em streaming. Tratar ausência como zero faria a chamada mais cara do dia
    // entrar como grátis, sem erro nenhum.
    expect(estimateAiCost('gateway/modelo-pago', units, TABELA)).toEqual({
      costMicros: 0,
      pricingKnown: false,
    });
  });

  it.each([
    ['unidade negativa', { inputUnits: -1, outputUnits: 10 }],
    ['unidade não finita (NaN)', { inputUnits: Number.NaN, outputUnits: 10 }],
    ['unidade não finita (Infinity)', { inputUnits: Number.POSITIVE_INFINITY, outputUnits: 10 }],
  ])('%s é dado corrompido do provedor, não custo', (_caso, units) => {
    // `NaN` é o pior: propagado como número, viraria `costMicros: NaN` e envenenaria toda soma
    // posterior — inclusive a da cota, que passaria a nunca estourar.
    const custo = estimateAiCost('gateway/modelo-pago', units, TABELA);
    expect(custo).toEqual({ costMicros: 0, pricingKnown: false });
  });

  it('segundo de áudio fracionário é medida legítima, não corrupção', () => {
    // `AiCallUnits.inputUnits` é "token **ou segundo de áudio**", e provedor de transcrição reporta
    // duração fracionária. Exigir inteiro parecia a checagem mais segura e desligava a medição de
    // áudio inteira na #141: toda chamada entraria como `pricingKnown: false`, acendendo o alerta
    // de anomalia com fatura real do outro lado e fechando a cota pelo teto de chamadas sem preço.
    //
    // 12,5 s a US$ 6,00 por milhão de segundos = 75 micro-dólares, e o arredondamento único no
    // fim é o que mantém isso exato.
    expect(estimateAiCost('gateway/audio', { inputUnits: 12.5, outputUnits: 0 }, TABELA)).toEqual({
      costMicros: 75,
      pricingKnown: true,
    });
  });

  it('capacidade sem saída cobrada precisa de `outputUnits: 0`, e aí o preço é conhecido', () => {
    // `/embeddings` devolve `prompt_tokens` e `total_tokens`, e **nunca** `completion_tokens`.
    // Quem mapear o `usage` campo a campo entrega `outputUnits: undefined` e todo embedding entra
    // como não precificado — com o modelo na tabela, o preço certo e nada errado à vista. O
    // contrato é do chamador porque só ele sabe qual é o caso; este par de asserções é onde ele
    // está escrito de forma executável.
    expect(
      estimateAiCost('gateway/modelo-pago', { inputUnits: 1_000, outputUnits: 0 }, TABELA),
    ).toEqual({ costMicros: 3_000, pricingKnown: true });
    expect(estimateAiCost('gateway/modelo-pago', { inputUnits: 1_000 }, TABELA)).toEqual({
      costMicros: 0,
      pricingKnown: false,
    });
  });

  it('arredonda uma vez só, no total — e não uma vez por lado', () => {
    // 2 tokens a US$ 0,15/M = 0,30 micro-unidade; 1 token a US$ 0,40/M = 0,40. Somando primeiro:
    // 0,70 → 1. Arredondando cada lado antes: round(0,30) + round(0,40) = 0 + 0 = 0.
    //
    // A diferença é uma micro-unidade por chamada, sempre descartada para baixo — subnotificação
    // sistemática, exatamente o erro que "dinheiro em inteiro" existe para evitar. Este caso falha
    // se alguém trocar a fórmula por dois `Math.round`.
    expect(
      estimateAiCost('gateway/modelo-barato', { inputUnits: 2, outputUnits: 1 }, TABELA),
    ).toEqual({ costMicros: 1, pricingKnown: true });

    // Confere a escala com números redondos: 1 token de cada lado a US$ 3/M e US$ 15/M = 3 + 15.
    expect(
      estimateAiCost('gateway/modelo-pago', { inputUnits: 1, outputUnits: 1 }, TABELA),
    ).toEqual({ costMicros: 18, pricingKnown: true });
  });

  it('mantém precisão inteira em volume alto — é onde Float erraria devagar', () => {
    // 10 milhões de tokens de entrada = exatamente US$ 30 = 30.000.000 micro-dólares.
    expect(
      estimateAiCost('gateway/modelo-pago', { inputUnits: 10_000_000, outputUnits: 0 }, TABELA),
    ).toEqual({ costMicros: 30_000_000, pricingKnown: true });
    expect(
      Number.isInteger(
        estimateAiCost(
          'gateway/modelo-pago',
          { inputUnits: 7_777_777, outputUnits: 3_333_333 },
          TABELA,
        ).costMicros,
      ),
    ).toBe(true);
  });
});

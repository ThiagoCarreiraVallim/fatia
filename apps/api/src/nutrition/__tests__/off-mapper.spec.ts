import {
  extrairBase,
  extrairKcal,
  extrairPorcao,
  mapearProdutoDoOff,
  type ResultadoDoMapeamento,
} from '../off-mapper';
import leiteCondensado from './fixtures/off-leite-condensado.json';
import acucarUniao from './fixtures/off-acucar-uniao.json';
import refrigerante from './fixtures/off-refrigerante.json';

/**
 * As três fixtures são respostas **reais** do Open Food Facts, baixadas do
 * endpoint v2 com os mesmos `fields` que o serviço pede. Foram escolhidas por
 * serem produtos brasileiros comuns que exercitam os três casos que importam:
 *
 * - Leite Moça: ficha completa, porção em gramas;
 * - Açúcar União: ficha **incompleta de verdade** — não tem `proteins_100g` nem
 *   `fat_100g`. É o caso que a regra do "nunca zero" existe para pegar, e não
 *   precisou ser inventado: é o que a base tem hoje para um produto de mercado;
 * - Coca-Cola 2 l: rótulo por 100 ml, porção em ml.
 */

function produtoOk(resultado: ResultadoDoMapeamento) {
  if (resultado.status !== 'ok') {
    throw new Error(`esperava status ok, veio ${resultado.status}`);
  }
  return resultado.product;
}

describe('mapearProdutoDoOff', () => {
  describe('produto brasileiro completo (Leite Moça)', () => {
    const resultado = mapearProdutoDoOff(leiteCondensado, '7891000100103');

    it('traduz a ficha inteira', () => {
      expect(produtoOk(resultado)).toEqual({
        barcode: '7891000100103',
        name: 'Leite Condensado Integral moça',
        brand: 'Nestlé',
        basis: '100g',
        kcalPer100g: 325,
        proteinPer100g: 7,
        carbsPer100g: 55,
        fatPer100g: 8,
        servingSize: 20,
        servingLabel: '20 g',
      });
    });

    it('usa só a primeira marca de `brands`, que vem como lista', () => {
      // A fixture traz "Nestlé, Moça" — "Nestlé, Moça" no rótulo do app seria
      // uma marca que não existe.
      expect(produtoOk(resultado).brand).toBe('Nestlé');
    });
  });

  describe('ficha incompleta (Açúcar União, sem proteína e sem gordura)', () => {
    const resultado = mapearProdutoDoOff(acucarUniao, '7891910000197');

    it('recusa o produto em vez de aceitar com macro faltando', () => {
      expect(resultado.status).toBe('incomplete');
    });

    it('diz exatamente o que falta', () => {
      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      expect(resultado.missing).toEqual(['proteinPer100g', 'fatPer100g']);
    });

    it('NÃO transforma campo ausente em zero — o campo fica ausente', () => {
      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      // `toBeUndefined` e não `toBeFalsy`: `0` também é falsy, e é exatamente o
      // valor errado que este teste existe para barrar.
      expect(resultado.partial.proteinPer100g).toBeUndefined();
      expect(resultado.partial.fatPer100g).toBeUndefined();
      expect('proteinPer100g' in resultado.partial).toBe(false);
      expect('fatPer100g' in resultado.partial).toBe(false);
    });

    it('aproveita o que veio, para o cadastro manual já nascer preenchido', () => {
      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      expect(resultado.partial.name).toBe('União Refinado');
      expect(resultado.partial.kcalPer100g).toBe(400);
      expect(resultado.partial.carbsPer100g).toBe(100);
      expect(resultado.partial.servingSize).toBe(5);
    });
  });

  describe('bebida com rótulo por 100 ml (Coca-Cola 2 l)', () => {
    const resultado = mapearProdutoDoOff(refrigerante, '7894900011517');

    it('marca a base como 100 ml em vez de anunciar por 100 g', () => {
      expect(produtoOk(resultado).basis).toBe('100ml');
    });

    it('mantém a porção do rótulo em ml, sem converter para grama', () => {
      const produto = produtoOk(resultado);
      expect(produto.servingSize).toBe(200);
      expect(produto.servingLabel).toBe('200ml');
    });

    it('aceita zero que o rótulo declara — zero declarado não é zero inventado', () => {
      // Refrigerante tem 0 g de proteína e de gordura no rótulo. A regra é
      // recusar campo *ausente*; recusar zero *presente* jogaria fora metade da
      // base.
      const produto = produtoOk(resultado);
      expect(produto.proteinPer100g).toBe(0);
      expect(produto.fatPer100g).toBe(0);
      expect(produto.kcalPer100g).toBe(42.5);
    });
  });

  describe('respostas degeneradas', () => {
    it('produto sem nome é recusado, mesmo com todos os macros', () => {
      const resultado = mapearProdutoDoOff(
        {
          status: 1,
          product: {
            nutriments: {
              'energy-kcal_100g': 100,
              proteins_100g: 1,
              carbohydrates_100g: 2,
              fat_100g: 3,
            },
          },
        },
        '7891000000000',
      );
      expect(resultado.status).toBe('incomplete');
      if (resultado.status !== 'incomplete') return;
      expect(resultado.missing).toEqual(['name']);
    });

    it('corpo vazio não estoura e devolve tudo faltando', () => {
      const resultado = mapearProdutoDoOff({}, '7891000000000');
      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      expect(resultado.missing).toEqual([
        'name',
        'kcalPer100g',
        'proteinPer100g',
        'carbsPer100g',
        'fatPer100g',
      ]);
    });

    it('descarta macro fora da faixa física em vez de repassar', () => {
      // 5500 kcal/100 g é o erro clássico de quem digitou o valor do pacote no
      // campo por 100 g. Aceitar isso registraria uma refeição de 11 000 kcal.
      const resultado = mapearProdutoDoOff(
        {
          status: 1,
          product: {
            product_name: 'Bolacha',
            nutriments: {
              'energy-kcal_100g': 5500,
              proteins_100g: 6,
              carbohydrates_100g: 60,
              fat_100g: 20,
            },
          },
        },
        '7891000000000',
      );
      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      expect(resultado.missing).toEqual(['kcalPer100g']);
      expect(resultado.partial.kcalPer100g).toBeUndefined();
    });

    it('descarta proteína, carboidrato e gordura acima de 100 g por 100 g', () => {
      // O teto do kcal já tinha teste; o dos três macros não tinha, e apagá-lo
      // deixava a suíte verde. 120 g de proteína em 100 g de produto é
      // impossível, e passar adiante é registrar refeição inventada.
      const resultado = mapearProdutoDoOff(
        {
          status: 1,
          product: {
            product_name: 'Suplemento',
            nutriments: {
              'energy-kcal_100g': 380,
              proteins_100g: 120,
              carbohydrates_100g: 150,
              fat_100g: 101,
            },
          },
        },
        '7891000000000',
      );

      if (resultado.status !== 'incomplete') throw new Error('esperava incomplete');
      expect(resultado.missing).toEqual(['proteinPer100g', 'carbsPer100g', 'fatPer100g']);
      expect(resultado.partial.proteinPer100g).toBeUndefined();
      expect(resultado.partial.carbsPer100g).toBeUndefined();
      expect(resultado.partial.fatPer100g).toBeUndefined();
      // O kcal, dentro da faixa, continua vindo: o corte é por campo.
      expect(resultado.partial.kcalPer100g).toBe(380);
    });

    it('aceita exatamente 100 g por 100 g, que é o açúcar puro', () => {
      // O limite é inclusivo de propósito: açúcar refinado declara 100 g de
      // carboidrato por 100 g, e recusar isso quebraria um produto real.
      const resultado = mapearProdutoDoOff(
        {
          status: 1,
          product: {
            product_name: 'Açúcar',
            nutriments: {
              'energy-kcal_100g': 400,
              proteins_100g: 0,
              carbohydrates_100g: 100,
              fat_100g: 0,
            },
          },
        },
        '7891910000197',
      );

      expect(produtoOk(resultado).carbsPer100g).toBe(100);
    });

    it('aceita macro em string, que o OFF devolve conforme quem preencheu', () => {
      const resultado = mapearProdutoDoOff(
        {
          status: 1,
          product: {
            product_name: 'Barra',
            nutriments: {
              'energy-kcal_100g': '412',
              proteins_100g: '9,5',
              carbohydrates_100g: '60',
              fat_100g: '14',
            },
          },
        },
        '7891000000000',
      );
      const produto = produtoOk(resultado);
      expect(produto.kcalPer100g).toBe(412);
      expect(produto.proteinPer100g).toBe(9.5);
    });
  });
});

describe('extrairKcal', () => {
  it('prefere kcal quando ela existe', () => {
    expect(extrairKcal({ 'energy-kcal_100g': 325, 'energy-kj_100g': 1365 })).toBe(325);
  });

  it('converte de kJ quando só há kJ', () => {
    // 1365 / 4,184 = 326,2… — a conversão é definição, não estimativa.
    expect(extrairKcal({ 'energy-kj_100g': 1365 })).toBe(326.2);
  });

  it('devolve null quando não há energia nenhuma', () => {
    expect(extrairKcal({ proteins_100g: 7 })).toBeNull();
  });
});

describe('extrairBase', () => {
  it('lê 100ml do rótulo', () => {
    expect(extrairBase({ nutrition_data_per: '100ml' })).toBe('100ml');
  });

  it('assume 100g quando o campo não veio', () => {
    expect(extrairBase({})).toBe('100g');
  });

  it('trata "serving" como 100g em vez de inventar base', () => {
    // `nutrition_data_per: "serving"` existe no OFF. Nesse caso os campos
    // `_100g` continuam por 100 g — quem muda é a origem do valor, não a base.
    expect(extrairBase({ nutrition_data_per: 'serving' })).toBe('100g');
  });
});

describe('extrairPorcao', () => {
  it('lê o campo estruturado quando a unidade bate com a base', () => {
    expect(extrairPorcao({ serving_quantity: 30, serving_quantity_unit: 'g' }, '100g')).toBe(30);
  });

  it('extrai as gramas de dentro do texto livre', () => {
    expect(extrairPorcao({ serving_size: '1 unidade (25 g)' }, '100g')).toBe(25);
  });

  it('recusa porção em ml para produto declarado por 100 g', () => {
    // Converter exigiria densidade. Chutar 1 g/ml para óleo erra 8%.
    expect(extrairPorcao({ serving_size: '200 ml' }, '100g')).toBeNull();
    expect(
      extrairPorcao({ serving_quantity: 200, serving_quantity_unit: 'ml' }, '100g'),
    ).toBeNull();
  });

  it('não confunde kg com g', () => {
    // Sem o corte de unidade, "0,5 kg" casaria o "5 g" do meio da string.
    expect(extrairPorcao({ serving_size: '0,5 kg' }, '100g')).toBeNull();
  });

  it('não confunde palavra iniciada por g com a unidade', () => {
    expect(extrairPorcao({ serving_size: '1 gelatina' }, '100g')).toBeNull();
  });

  it('recusa porção absurda em vez de aceitar o número', () => {
    expect(extrairPorcao({ serving_size: '5000 g' }, '100g')).toBeNull();
  });

  it('recusa porção absurda também no campo estruturado', () => {
    // O texto livre já tinha teste; o ramo estruturado não, e o teto podia
    // sumir sem nenhuma suíte reclamar. Uma porção de 5 kg pré-selecionaria o
    // botão "1 porção (5000 g)" na tela.
    expect(
      extrairPorcao({ serving_quantity: 5000, serving_quantity_unit: 'g' }, '100g'),
    ).toBeNull();
    expect(extrairPorcao({ serving_quantity: 2000, serving_quantity_unit: 'g' }, '100g')).toBe(
      2000,
    );
  });

  it('recusa porção zerada ou negativa no campo estruturado', () => {
    expect(extrairPorcao({ serving_quantity: 0, serving_quantity_unit: 'g' }, '100g')).toBeNull();
    expect(extrairPorcao({ serving_quantity: -30, serving_quantity_unit: 'g' }, '100g')).toBeNull();
  });

  it('devolve null quando não há porção no rótulo', () => {
    expect(extrairPorcao({}, '100g')).toBeNull();
  });
});

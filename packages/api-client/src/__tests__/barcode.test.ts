import { describe, expect, it } from 'vitest';
import { ApiError } from '../http';
import type { ScannedProduct } from '../nutrition';
import {
  UNKNOWN_BARCODE_MESSAGE,
  OFF_UNAVAILABLE_MESSAGE,
  isValidBarcode,
  productFormFromPartial,
  mealItemFromProductForm,
  mealItemFromProduct,
  lookupErrorMessage,
  incompleteProductMessage,
  productName,
  servingOptions,
  canProcessScan,
  productPreview,
  lockAfterClose,
  baseUnit,
  customFoodFromProduct,
  customFoodFromProductForm,
  findSavedProduct,
  savedProductItem,
} from '../barcode';

/** Dados reais do Open Food Facts, os mesmos das fixtures da API. */
const leiteCondensado: ScannedProduct = {
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
};

const refrigerante: ScannedProduct = {
  barcode: '7894900011517',
  name: 'Refrigerante Coca-Cola 2Lt',
  brand: 'Coca-Cola',
  basis: '100ml',
  kcalPer100g: 42.5,
  proteinPer100g: 0,
  carbsPer100g: 10.5,
  fatPer100g: 0,
  servingSize: 200,
  servingLabel: '200ml',
};

describe('isValidBarcode', () => {
  it('aceita os formatos que a câmera lê', () => {
    expect(isValidBarcode('7891000100103')).toBe(true); // EAN-13
    expect(isValidBarcode('78910011')).toBe(true); // EAN-8
    expect(isValidBarcode('012345678905')).toBe(true); // UPC-A
  });

  it('recusa o que não é código de barras', () => {
    expect(isValidBarcode('https://fatia.ia.br')).toBe(false);
    expect(isValidBarcode('1234567')).toBe(false);
    expect(isValidBarcode('789100010010345')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });
});

describe('canProcessScan', () => {
  it('aceita a primeira leitura de um código válido', () => {
    expect(canProcessScan('7891000100103', null)).toBe(true);
  });

  it('ignora a repetição do mesmo código', () => {
    // A câmera dispara várias vezes por segundo com o código enquadrado; sem a
    // trava, um produto vira dezenas de requisições ao Open Food Facts.
    expect(canProcessScan('7891000100103', '7891000100103')).toBe(false);
  });

  it('aceita um código diferente logo em seguida', () => {
    expect(canProcessScan('7891910000197', '7891000100103')).toBe(true);
  });

  it('ignora leitura inválida mesmo sendo a primeira', () => {
    expect(canProcessScan('nao-e-codigo', null)).toBe(false);
  });
});

describe('lockAfterClose', () => {
  it('cancelar mantém o código travado, senão o drawer reabre sozinho', () => {
    // A embalagem continua enquadrada quando a pessoa toca em "Cancelar". Se a
    // trava caísse aqui, a câmera releria o mesmo código no instante seguinte, o
    // cache em memória responderia em milissegundos e o drawer voltaria — e o
    // único botão dele é justamente o "Cancelar" que acabou de não funcionar.
    const trava = lockAfterClose('7891000100103', 'dismissed');

    expect(trava).toBe('7891000100103');
    expect(canProcessScan('7891000100103', trava)).toBe(false);
  });

  it('descartar não trava produto diferente', () => {
    const trava = lockAfterClose('7891000100103', 'dismissed');
    expect(canProcessScan('7891910000197', trava)).toBe(true);
  });

  it('"Ler outro" libera o mesmo código', () => {
    const trava = lockAfterClose('7891000100103', 'rescan');

    expect(trava).toBeNull();
    expect(canProcessScan('7891000100103', trava)).toBe(true);
  });
});

describe('servingOptions', () => {
  it('oferece a porção do rótulo antes da quantidade padrão', () => {
    expect(servingOptions(leiteCondensado)).toEqual([
      { label: '1 porção (20 g)', amount: 20 },
      { label: '100 g', amount: 100 },
    ]);
  });

  it('usa ml quando o rótulo é por 100 ml', () => {
    expect(servingOptions(refrigerante)).toEqual([
      { label: '1 porção (200 ml)', amount: 200 },
      { label: '100 ml', amount: 100 },
    ]);
  });

  it('sem porção conhecida, oferece só a quantidade padrão', () => {
    // O rótulo dizia "1 unidade" sem gramas, ou dizia ml num produto por 100 g.
    // Chutar a conversão aqui seria errar com aparência de precisão.
    expect(servingOptions({ basis: '100g', servingSize: null })).toEqual([
      { label: '100 g', amount: 100 },
    ]);
  });

  it('não repete o botão quando a porção é exatamente 100', () => {
    expect(servingOptions({ basis: '100g', servingSize: 100 })).toEqual([
      { label: '1 porção (100 g)', amount: 100 },
    ]);
  });
});

describe('baseUnit', () => {
  it('distingue rótulo por 100 g de rótulo por 100 ml', () => {
    expect(baseUnit('100g')).toBe('g');
    expect(baseUnit('100ml')).toBe('ml');
  });
});

describe('productPreview', () => {
  it('faz a regra de três a partir do rótulo por 100', () => {
    expect(productPreview(leiteCondensado, 20)).toEqual({
      kcal: 65,
      proteinG: 1.4,
      carbsG: 11,
      fatG: 1.6,
    });
  });

  it('aceita a quantidade digitada como texto, com vírgula decimal', () => {
    expect(productPreview(leiteCondensado, '50')?.kcal).toBe(163);
    expect(productPreview(leiteCondensado, '12,5')?.kcal).toBe(41);
  });

  it('devolve null para quantidade que não é número positivo', () => {
    expect(productPreview(leiteCondensado, '')).toBeNull();
    expect(productPreview(leiteCondensado, 'abc')).toBeNull();
    expect(productPreview(leiteCondensado, 0)).toBeNull();
    expect(productPreview(leiteCondensado, -30)).toBeNull();
  });

  it('mantém uma casa nos macros em vez de arredondar tudo para inteiro', () => {
    // Uma porção de 20 g de leite condensado tem 1,4 g de proteína. Arredondar
    // para 1 g erra 30% no item, e o erro se acumula no total do dia.
    expect(productPreview(leiteCondensado, 20)?.proteinG).toBe(1.4);
  });
});

describe('productName', () => {
  it('acrescenta a marca, que é o que distingue duas fichas parecidas', () => {
    expect(productName({ name: 'Leite Condensado', brand: 'Nestlé' })).toBe(
      'Leite Condensado (Nestlé)',
    );
  });

  it('não repete a marca quando ela já está no nome', () => {
    expect(productName({ name: 'Refrigerante Coca-Cola 2Lt', brand: 'Coca-Cola' })).toBe(
      'Refrigerante Coca-Cola 2Lt',
    );
  });

  it('não repete a marca quando ela está no nome com outra caixa', () => {
    // O OFF é campo livre: a mesma marca aparece "Coca-Cola", "COCA-COLA" e
    // "coca cola" conforme quem preencheu. Comparação exata devolveria
    // "Refrigerante COCA-COLA 2Lt (Coca-Cola)" no histórico.
    expect(productName({ name: 'Refrigerante COCA-COLA 2Lt', brand: 'Coca-Cola' })).toBe(
      'Refrigerante COCA-COLA 2Lt',
    );
    expect(productName({ name: 'Leite Condensado MOÇA', brand: 'moça' })).toBe(
      'Leite Condensado MOÇA',
    );
  });

  it('funciona sem marca', () => {
    expect(productName({ name: 'Biscoito', brand: null })).toBe('Biscoito');
  });

  it('corta em 160 caracteres, o limite que a API aceita', () => {
    // Nome do OFF é campo livre e produto de importado chega com a descrição
    // inteira. Sem o corte, a API recusa o item com 400 e a refeição não entra.
    const nome = productName({ name: 'A'.repeat(200), brand: 'Marca' });
    expect(nome).toHaveLength(160);
  });
});

describe('mealItemFromProduct', () => {
  it('monta item livre com os macros do rótulo e sem foodId', () => {
    const item = mealItemFromProduct(leiteCondensado, 20);

    expect(item).toEqual({
      foodName: 'Leite Condensado Integral moça (Nestlé)',
      grams: 20,
      kcal: 65,
      proteinG: 1.4,
      carbsG: 11,
      fatG: 1.6,
    });
    expect('foodId' in item).toBe(false);
  });

  it('para bebida, registra o volume escolhido como grama (1 ml ≈ 1 g)', () => {
    // Aproximação assumida e avisada na tela: a densidade de refrigerante fica
    // em torno de 1,04. Recusar bebida tiraria do scanner a categoria que a
    // ADR 016 apontou como lacuna.
    const item = mealItemFromProduct(refrigerante, 200);
    expect(item.grams).toBe(200);
    expect(item.kcal).toBe(85);
  });

  it('recusa quantidade inválida em vez de gravar NaN', () => {
    expect(() => mealItemFromProduct(leiteCondensado, 0)).toThrow();
  });
});

describe('incompleteProductMessage', () => {
  it('nomeia o que falta, em português', () => {
    expect(incompleteProductMessage(['proteinPer100g', 'fatPer100g'])).toBe(
      'A ficha do Open Food Facts está sem proteína e gordura. Confira no rótulo e complete abaixo.',
    );
  });

  it('concorda no singular', () => {
    expect(incompleteProductMessage(['kcalPer100g'])).toContain('está sem calorias.');
  });

  it('lista três campos com vírgula e "e"', () => {
    expect(incompleteProductMessage(['kcalPer100g', 'proteinPer100g', 'fatPer100g'])).toContain(
      'sem calorias, proteína e gordura.',
    );
  });
});

describe('lookupErrorMessage', () => {
  it('404 convida a cadastrar, porque o código não existe lá', () => {
    expect(lookupErrorMessage(new ApiError('nf', 404))).toBe(UNKNOWN_BARCODE_MESSAGE);
  });

  it('503 convida a tentar de novo, porque o produto pode existir', () => {
    // Tratar 503 como 404 faria a pessoa recadastrar à mão um produto que o
    // Open Food Facts conhece.
    expect(lookupErrorMessage(new ApiError('down', 503))).toBe(OFF_UNAVAILABLE_MESSAGE);
    expect(lookupErrorMessage(new ApiError('down', 503))).not.toBe(UNKNOWN_BARCODE_MESSAGE);
  });

  it('400 fala do código, não de cadastro', () => {
    expect(lookupErrorMessage(new ApiError('bad', 400))).toContain('Confira os números');
  });

  it('erro sem status vira mensagem genérica', () => {
    expect(lookupErrorMessage(new Error('boom'))).toBe(
      'Não foi possível consultar o produto. Tente de novo.',
    );
  });
});

describe('productFormFromPartial', () => {
  const acucar = {
    barcode: '7891910000197',
    basis: '100g' as const,
    name: 'União Refinado',
    brand: 'Tio João',
    kcalPer100g: 400,
    carbsPer100g: 100,
    servingSize: 5,
    servingLabel: '5 g',
  };

  it('deixa vazio o campo que a ficha não tinha — nunca zero', () => {
    const form = productFormFromPartial(acucar);

    // `''` e não `'0'`: zero pré-preenchido é aceito sem ler, e aí o macro
    // errado entra no histórico com cara de conferido.
    expect(form.proteinG).toBe('');
    expect(form.fatG).toBe('');
    expect(form.proteinG).not.toBe('0');
  });

  it('traz os macros por 100, e a porção do rótulo só como quantidade', () => {
    const form = productFormFromPartial(acucar);

    // Os macros ficam na unidade em que o rótulo os publica. Converter para a
    // porção — como se fazia antes — criava campo cujo significado dependia do
    // campo `grams`: mudar a quantidade não mexia neles e o registro saía
    // errado. Ver o teste de 50 g abaixo.
    expect(form.grams).toBe('5');
    expect(form.kcal).toBe('400');
    expect(form.carbsG).toBe('100');
  });

  it('cai em 100 quando não há porção conhecida', () => {
    const form = productFormFromPartial({ ...acucar, servingSize: null });
    expect(form.grams).toBe('100');
    expect(form.kcal).toBe('400');
  });

  it('preserva o zero que a ficha declarou', () => {
    // Zero declarado é dado; zero ausente é chute. Só o segundo vira vazio.
    const form = productFormFromPartial({ ...acucar, fatPer100g: 0, servingSize: 100 });
    expect(form.fatG).toBe('0');
  });

  it('sem nome, o campo fica vazio para a pessoa preencher', () => {
    const form = productFormFromPartial({ barcode: '789', basis: '100g', name: undefined });
    expect(form.name).toBe('');
  });
});

describe('mealItemFromProductForm', () => {
  const acucar = {
    barcode: '7891910000197',
    basis: '100g' as const,
    name: 'União Refinado',
    brand: 'Tio João',
    kcalPer100g: 400,
    carbsPer100g: 100,
    servingSize: 5,
    servingLabel: '5 g',
  };

  /** Ficha do açúcar já completada à mão: falta proteína e gordura no OFF. */
  const completado = () => ({
    ...productFormFromPartial(acucar),
    proteinG: '0',
    fatG: '0',
  });

  it('recusa o item enquanto falta macro — o branco viraria zero na API', () => {
    // `MealService` grava `kcal: item.kcal ?? 0`, e o mesmo para os outros três.
    // Campo em branco que chegue lá entra no histórico como zero conferido. O
    // caminho eram dois toques: abrir o drawer e tocar em "Adicionar".
    const form = productFormFromPartial(acucar);

    expect(form.proteinG).toBe('');
    expect(mealItemFromProductForm(form)).toBeNull();
  });

  it('aceita o zero que a pessoa digitou, que é dado e não ausência', () => {
    const item = mealItemFromProductForm(completado());

    expect(item).not.toBeNull();
    expect(item?.proteinG).toBe(0);
  });

  it('50 g de açúcar registram 200 kcal, e não as 20 kcal da porção de 5 g', () => {
    // O cenário do defeito: a pessoa lê "5" na quantidade, troca para 50 porque
    // foi isso que comeu, e salva. Com os macros presos à porção do rótulo, iam
    // 50 g com 20 kcal e 5 g de carboidrato — dez vezes menos.
    const item = mealItemFromProductForm({ ...completado(), grams: '50' });

    expect(item?.grams).toBe(50);
    expect(item?.kcal).toBe(200);
    expect(item?.carbsG).toBe(50);
  });

  it('a porção do rótulo, mantida, dá o total daquela porção', () => {
    const item = mealItemFromProductForm(completado());

    expect(item?.grams).toBe(5);
    expect(item?.kcal).toBe(20);
    expect(item?.carbsG).toBe(5);
  });

  it('recusa nome vazio ou só espaços', () => {
    expect(mealItemFromProductForm({ ...completado(), name: '' })).toBeNull();
    expect(mealItemFromProductForm({ ...completado(), name: '   ' })).toBeNull();
  });

  it('recusa quantidade não positiva ou não numérica', () => {
    expect(mealItemFromProductForm({ ...completado(), grams: '0' })).toBeNull();
    expect(mealItemFromProductForm({ ...completado(), grams: '-5' })).toBeNull();
    expect(mealItemFromProductForm({ ...completado(), grams: 'abc' })).toBeNull();
    expect(mealItemFromProductForm({ ...completado(), grams: '' })).toBeNull();
  });

  it('recusa macro negativo ou não numérico em vez de gravar NaN', () => {
    expect(mealItemFromProductForm({ ...completado(), kcal: '-1' })).toBeNull();
    expect(mealItemFromProductForm({ ...completado(), fatG: 'abc' })).toBeNull();
  });

  it('não manda foodId: é item livre, o produto não virou Food', () => {
    const item = mealItemFromProductForm(completado());
    expect(item !== null && 'foodId' in item).toBe(false);
  });

  it('corta o nome em 160 caracteres, o limite que a API aceita', () => {
    const item = mealItemFromProductForm({ ...completado(), name: 'A'.repeat(200) });
    expect(item?.foodName).toHaveLength(160);
  });
});

describe('customFoodFromProduct', () => {
  it('guarda por 100 g, com a marca no nome e a porção do rótulo como medida', () => {
    const parsed = customFoodFromProduct(leiteCondensado);

    expect(parsed).toEqual({
      ok: true,
      input: {
        name: 'Leite Condensado Integral moça (Nestlé)',
        kcalPer100g: 325,
        proteinPer100g: 7,
        carbsPer100g: 55,
        fatPer100g: 8,
        portions: [{ label: 'porção', grams: 20 }],
      },
    });
  });

  it('sem porção conhecida, guarda sem medida', () => {
    const parsed = customFoodFromProduct({ ...leiteCondensado, servingSize: null });
    expect(parsed.ok && parsed.input.portions).toBeUndefined();
  });

  it('recusa o que a API recusaria, em vez de deixar o 400 para depois do toque', () => {
    // O mapper do OFF aceita até 1000 kcal em 100 g; o cadastro, só 900.
    const parsed = customFoodFromProduct({ ...leiteCondensado, kcalPer100g: 950 });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.errors.kcal).toContain('900 kcal');
  });
});

describe('customFoodFromProductForm', () => {
  it('usa os valores por 100 completados à mão', () => {
    const parsed = customFoodFromProductForm({
      name: 'União Refinado (Tio João)',
      grams: '5',
      kcal: '400',
      proteinG: '0',
      carbsG: '100',
      fatG: '0',
    });
    expect(parsed).toEqual({
      ok: true,
      input: {
        name: 'União Refinado (Tio João)',
        kcalPer100g: 400,
        proteinPer100g: 0,
        carbsPer100g: 100,
        fatPer100g: 0,
      },
    });
  });

  it('sem calorias, não guarda', () => {
    const parsed = customFoodFromProductForm({
      name: 'Açúcar',
      grams: '5',
      kcal: '',
      proteinG: '0',
      carbsG: '100',
      fatG: '0',
    });
    expect(parsed.ok).toBe(false);
  });
});

describe('findSavedProduct', () => {
  const guardados = [
    { id: 1, name: 'Granola Caseira' },
    { id: 2, name: 'Leite Condensado Integral Moça (Nestlé)' },
  ];

  it('acha o produto já guardado sem ligar para caixa nem acento', () => {
    expect(findSavedProduct(guardados, 'leite condensado integral moca (nestle)')?.id).toBe(2);
  });

  it('não acha o que não foi guardado', () => {
    expect(findSavedProduct(guardados, 'Leite Condensado')).toBeUndefined();
  });
});

describe('savedProductItem', () => {
  const guardado = {
    id: 7,
    portions: [{ id: 'p1', label: 'porção', grams: 20, mine: true }],
  };

  it('a porção do rótulo vira a medida, para o histórico dizer "1 porção (20 g)"', () => {
    expect(savedProductItem(guardado, 20)).toEqual({ foodId: 7, portionId: 'p1', quantity: 1 });
  });

  it('outra quantidade vai em gramas', () => {
    expect(savedProductItem(guardado, 50)).toEqual({ foodId: 7, grams: 50 });
    expect(savedProductItem({ id: 7 }, 20)).toEqual({ foodId: 7, grams: 20 });
  });
});

import { describe, expect, it } from 'vitest';
import type { MealRecognition, RecognizedFoodItem } from '@fatia/api-client';
import {
  faixaDeConfianca,
  itensDeRefeicao,
  itensEditaveis,
  itensParaGravar,
  mensagemDeFotoSemComida,
  podeGravar,
  previaDoItem,
} from '../recognition-mapping';

function reconhecido(parcial: Partial<RecognizedFoodItem> = {}): RecognizedFoodItem {
  return {
    nomeReconhecido: 'arroz',
    foodId: null,
    nomeDoCatalogo: null,
    grams: 150,
    confidence: 0.8,
    estimado: true,
    kcal: 195,
    proteinG: 3,
    carbsG: 42,
    fatG: 0.3,
    ...parcial,
  };
}

function resposta(itens: RecognizedFoodItem[]): MealRecognition {
  return { itens, observacao: null };
}

describe('itensEditaveis', () => {
  it('nasce com tudo marcado — desmarcar é do usuário, não o contrário', () => {
    const itens = itensEditaveis(resposta([reconhecido(), reconhecido({ grams: 90 })]));

    expect(itens.map((i) => i.incluido)).toEqual([true, true]);
    expect(itens.map((i) => i.gramas)).toEqual(['150', '90']);
  });

  it('dá chave distinta a itens de mesmo nome', () => {
    // Um prato com dois pedaços de pão devolve "pão" duas vezes. Chave pelo nome
    // faria a lista do React reutilizar a linha errada e a edição de porção de um
    // aparecer no outro.
    const itens = itensEditaveis(
      resposta([reconhecido({ grams: 50 }), reconhecido({ grams: 70 })]),
    );

    expect(new Set(itens.map((i) => i.chave)).size).toBe(2);
  });

  it('item casado com a TACO não carrega cópia de macro', () => {
    // Guardar uma cópia faria o número exibido divergir do gravado assim que a
    // porção mudasse — quem recalcula é a API, a partir de `foodId`.
    const [item] = itensEditaveis(
      resposta([
        reconhecido({
          foodId: 42,
          nomeDoCatalogo: 'Arroz, integral, cozido',
          estimado: false,
          kcal: 186,
        }),
      ]),
    );

    expect(item.macrosPorGrama).toBeNull();
    expect(previaDoItem(item)).toBeNull();
    expect(podeGravar(item)).toBe(true);
  });
});

describe('previaDoItem', () => {
  it('reescala a estimativa quando a pessoa corrige a porção', () => {
    const [item] = itensEditaveis(
      resposta([reconhecido({ grams: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 4 })]),
    );

    expect(previaDoItem({ ...item, gramas: '50' })).toEqual({
      kcal: 100,
      proteinG: 5,
      carbsG: 10,
      fatG: 2,
    });
  });

  it('porção em branco ou inválida não vira zero', () => {
    const [item] = itensEditaveis(resposta([reconhecido()]));

    expect(previaDoItem({ ...item, gramas: '' })).toBeNull();
    expect(previaDoItem({ ...item, gramas: '0' })).toBeNull();
    expect(previaDoItem({ ...item, gramas: 'abc' })).toBeNull();
  });
});

describe('podeGravar', () => {
  it('item livre sem macro nenhum não pode ser gravado', () => {
    // Ele iria para a refeição valendo zero caloria, que é indistinguível de um
    // alimento que realmente não tem caloria. A tela manda buscar no catálogo.
    const [item] = itensEditaveis(
      resposta([reconhecido({ kcal: null, proteinG: null, carbsG: null, fatG: null })]),
    );

    expect(item.macrosPorGrama).toBeNull();
    expect(podeGravar(item)).toBe(false);
  });

  it('item livre com macro parcial também não passa', () => {
    // Metade dos macros preenchida e metade em zero é pior que nenhum: o total
    // do dia fica errado e nada indica isso.
    const [item] = itensEditaveis(resposta([reconhecido({ carbsG: null })]));

    expect(podeGravar(item)).toBe(false);
  });

  it('porção inválida barra a gravação mesmo com macro completo', () => {
    const [item] = itensEditaveis(resposta([reconhecido()]));

    expect(podeGravar({ ...item, gramas: '-5' })).toBe(false);
  });
});

describe('itensDeRefeicao', () => {
  it('grava só o que ficou marcado', () => {
    const itens = itensEditaveis(
      resposta([
        reconhecido({ nomeReconhecido: 'arroz' }),
        reconhecido({ nomeReconhecido: 'refrigerante' }),
      ]),
    );
    const semRefrigerante = itens.map((i) =>
      i.nomeReconhecido === 'refrigerante' ? { ...i, incluido: false } : i,
    );

    const payload = itensDeRefeicao(semRefrigerante);

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ foodName: 'arroz' });
  });

  it('item casado manda só foodId e grams — o macro é da TACO', () => {
    const itens = itensEditaveis(
      resposta([
        reconhecido({
          foodId: 42,
          nomeDoCatalogo: 'Arroz, integral, cozido',
          estimado: false,
        }),
      ]),
    );

    const [payload] = itensDeRefeicao(itens.map((i) => ({ ...i, gramas: '200' })));

    expect(payload).toEqual({ foodId: 42, grams: 200 });
    // Nenhum macro do modelo viaja junto: se viajasse, a API poderia preferi-lo
    // ao da tabela e o casamento com a TACO teria sido em vão.
    expect(Object.keys(payload).sort()).toEqual(['foodId', 'grams']);
  });

  it('item livre manda os macros da porção corrigida, não da estimada', () => {
    const itens = itensEditaveis(
      resposta([reconhecido({ grams: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 4 })]),
    );

    const [payload] = itensDeRefeicao(itens.map((i) => ({ ...i, gramas: '150' })));

    expect(payload).toMatchObject({ grams: 150, kcal: 300, proteinG: 15, carbsG: 30, fatG: 6 });
  });

  it('nem confiança nem "estimado" chegam ao banco', () => {
    // Confiança auto-relatada por LLM não é calibrada. Gravada, ela vira um
    // número que alguém acredita.
    const itens = itensEditaveis(resposta([reconhecido({ confidence: 0.31 })]));

    const [payload] = itensDeRefeicao(itens);

    expect(Object.keys(payload)).not.toContain('confidence');
    expect(Object.keys(payload)).not.toContain('estimado');
  });

  it('item marcado mas ingravável não escapa pelo botão', () => {
    // `itensParaGravar` e o botão da tela usam a mesma decisão: se divergissem,
    // um item sem macro entraria zerado ao tocar "Registrar".
    const itens = itensEditaveis(resposta([reconhecido({ kcal: null })]));

    expect(itensParaGravar(itens)).toEqual([]);
    expect(itensDeRefeicao(itens)).toEqual([]);
  });
});

describe('faixaDeConfianca', () => {
  it('separa alta, média e baixa', () => {
    expect(faixaDeConfianca(0.9)).toBe('alta');
    expect(faixaDeConfianca(0.75)).toBe('alta');
    expect(faixaDeConfianca(0.6)).toBe('media');
    expect(faixaDeConfianca(0.44)).toBe('baixa');
    expect(faixaDeConfianca(0)).toBe('baixa');
  });
});

describe('mensagemDeFotoSemComida', () => {
  it('sempre aponta um caminho, nunca só o erro', () => {
    expect(mensagemDeFotoSemComida(null)).toContain('busca de alimento');
    expect(mensagemDeFotoSemComida('  ')).toContain('busca de alimento');
    expect(mensagemDeFotoSemComida('prato coberto')).toContain('prato coberto');
  });
});

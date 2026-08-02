import { describe, expect, it } from 'vitest';
import { ApiError, type ScannedProduct } from '@fatia/api-client';
import {
  MENSAGEM_CODIGO_DESCONHECIDO,
  MENSAGEM_OFF_INDISPONIVEL,
  TIPOS_DE_CODIGO,
  codigoDeBarrasValido,
  formularioAPartirDaFicha,
  itemDeRefeicaoDoProduto,
  mensagemDeFalhaNaConsulta,
  mensagemDeFichaIncompleta,
  nomeDoProduto,
  opcoesDePorcao,
  podeProcessarLeitura,
  previaDoProduto,
  unidadeDaBase,
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

describe('codigoDeBarrasValido', () => {
  it('aceita os formatos que a câmera lê', () => {
    expect(codigoDeBarrasValido('7891000100103')).toBe(true); // EAN-13
    expect(codigoDeBarrasValido('78910011')).toBe(true); // EAN-8
    expect(codigoDeBarrasValido('012345678905')).toBe(true); // UPC-A
  });

  it('recusa o que não é código de barras', () => {
    expect(codigoDeBarrasValido('https://fatia.ia.br')).toBe(false);
    expect(codigoDeBarrasValido('1234567')).toBe(false);
    expect(codigoDeBarrasValido('789100010010345')).toBe(false);
    expect(codigoDeBarrasValido('')).toBe(false);
  });
});

describe('TIPOS_DE_CODIGO', () => {
  it('não inclui QR Code', () => {
    // Com QR ligado, qualquer adesivo enquadrado sem querer dispara a consulta.
    expect(TIPOS_DE_CODIGO).not.toContain('qr');
  });
});

describe('podeProcessarLeitura', () => {
  it('aceita a primeira leitura de um código válido', () => {
    expect(podeProcessarLeitura('7891000100103', null)).toBe(true);
  });

  it('ignora a repetição do mesmo código', () => {
    // A câmera dispara várias vezes por segundo com o código enquadrado; sem a
    // trava, um produto vira dezenas de requisições ao Open Food Facts.
    expect(podeProcessarLeitura('7891000100103', '7891000100103')).toBe(false);
  });

  it('aceita um código diferente logo em seguida', () => {
    expect(podeProcessarLeitura('7891910000197', '7891000100103')).toBe(true);
  });

  it('ignora leitura inválida mesmo sendo a primeira', () => {
    expect(podeProcessarLeitura('nao-e-codigo', null)).toBe(false);
  });
});

describe('opcoesDePorcao', () => {
  it('oferece a porção do rótulo antes da quantidade padrão', () => {
    expect(opcoesDePorcao(leiteCondensado)).toEqual([
      { rotulo: '1 porção (20 g)', quantidade: 20 },
      { rotulo: '100 g', quantidade: 100 },
    ]);
  });

  it('usa ml quando o rótulo é por 100 ml', () => {
    expect(opcoesDePorcao(refrigerante)).toEqual([
      { rotulo: '1 porção (200 ml)', quantidade: 200 },
      { rotulo: '100 ml', quantidade: 100 },
    ]);
  });

  it('sem porção conhecida, oferece só a quantidade padrão', () => {
    // O rótulo dizia "1 unidade" sem gramas, ou dizia ml num produto por 100 g.
    // Chutar a conversão aqui seria errar com aparência de precisão.
    expect(opcoesDePorcao({ basis: '100g', servingSize: null })).toEqual([
      { rotulo: '100 g', quantidade: 100 },
    ]);
  });

  it('não repete o botão quando a porção é exatamente 100', () => {
    expect(opcoesDePorcao({ basis: '100g', servingSize: 100 })).toEqual([
      { rotulo: '1 porção (100 g)', quantidade: 100 },
    ]);
  });
});

describe('unidadeDaBase', () => {
  it('distingue rótulo por 100 g de rótulo por 100 ml', () => {
    expect(unidadeDaBase('100g')).toBe('g');
    expect(unidadeDaBase('100ml')).toBe('ml');
  });
});

describe('previaDoProduto', () => {
  it('faz a regra de três a partir do rótulo por 100', () => {
    expect(previaDoProduto(leiteCondensado, 20)).toEqual({
      kcal: 65,
      proteinG: 1.4,
      carbsG: 11,
      fatG: 1.6,
    });
  });

  it('aceita a quantidade digitada como texto', () => {
    expect(previaDoProduto(leiteCondensado, '50')?.kcal).toBe(163);
  });

  it('devolve null para quantidade que não é número positivo', () => {
    expect(previaDoProduto(leiteCondensado, '')).toBeNull();
    expect(previaDoProduto(leiteCondensado, 'abc')).toBeNull();
    expect(previaDoProduto(leiteCondensado, 0)).toBeNull();
    expect(previaDoProduto(leiteCondensado, -30)).toBeNull();
  });

  it('mantém uma casa nos macros em vez de arredondar tudo para inteiro', () => {
    // Uma porção de 20 g de leite condensado tem 1,4 g de proteína. Arredondar
    // para 1 g erra 30% no item, e o erro se acumula no total do dia.
    expect(previaDoProduto(leiteCondensado, 20)?.proteinG).toBe(1.4);
  });
});

describe('nomeDoProduto', () => {
  it('acrescenta a marca, que é o que distingue duas fichas parecidas', () => {
    expect(nomeDoProduto({ name: 'Leite Condensado', brand: 'Nestlé' })).toBe(
      'Leite Condensado (Nestlé)',
    );
  });

  it('não repete a marca quando ela já está no nome', () => {
    expect(nomeDoProduto({ name: 'Refrigerante Coca-Cola 2Lt', brand: 'Coca-Cola' })).toBe(
      'Refrigerante Coca-Cola 2Lt',
    );
  });

  it('funciona sem marca', () => {
    expect(nomeDoProduto({ name: 'Biscoito', brand: null })).toBe('Biscoito');
  });

  it('corta em 160 caracteres, o limite que a API aceita', () => {
    // Nome do OFF é campo livre e produto de importado chega com a descrição
    // inteira. Sem o corte, a API recusa o item com 400 e a refeição não entra.
    const nome = nomeDoProduto({ name: 'A'.repeat(200), brand: 'Marca' });
    expect(nome).toHaveLength(160);
  });
});

describe('itemDeRefeicaoDoProduto', () => {
  it('monta item livre com os macros do rótulo e sem foodId', () => {
    const item = itemDeRefeicaoDoProduto(leiteCondensado, 20);

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
    const item = itemDeRefeicaoDoProduto(refrigerante, 200);
    expect(item.grams).toBe(200);
    expect(item.kcal).toBe(85);
  });

  it('recusa quantidade inválida em vez de gravar NaN', () => {
    expect(() => itemDeRefeicaoDoProduto(leiteCondensado, 0)).toThrow();
  });
});

describe('mensagemDeFichaIncompleta', () => {
  it('nomeia o que falta, em português', () => {
    expect(mensagemDeFichaIncompleta(['proteinPer100g', 'fatPer100g'])).toBe(
      'A ficha do Open Food Facts está sem proteína e gordura. Confira no rótulo e complete abaixo.',
    );
  });

  it('concorda no singular', () => {
    expect(mensagemDeFichaIncompleta(['kcalPer100g'])).toContain('está sem calorias.');
  });

  it('lista três campos com vírgula e "e"', () => {
    expect(mensagemDeFichaIncompleta(['kcalPer100g', 'proteinPer100g', 'fatPer100g'])).toContain(
      'sem calorias, proteína e gordura.',
    );
  });
});

describe('mensagemDeFalhaNaConsulta', () => {
  it('404 convida a cadastrar, porque o código não existe lá', () => {
    expect(mensagemDeFalhaNaConsulta(new ApiError('nf', 404))).toBe(MENSAGEM_CODIGO_DESCONHECIDO);
  });

  it('503 convida a tentar de novo, porque o produto pode existir', () => {
    // Tratar 503 como 404 faria a pessoa recadastrar à mão um produto que o
    // Open Food Facts conhece.
    expect(mensagemDeFalhaNaConsulta(new ApiError('down', 503))).toBe(MENSAGEM_OFF_INDISPONIVEL);
    expect(mensagemDeFalhaNaConsulta(new ApiError('down', 503))).not.toBe(
      MENSAGEM_CODIGO_DESCONHECIDO,
    );
  });

  it('400 fala de leitura, não de cadastro', () => {
    expect(mensagemDeFalhaNaConsulta(new ApiError('bad', 400))).toContain('escanear');
  });

  it('erro sem status vira mensagem genérica', () => {
    expect(mensagemDeFalhaNaConsulta(new Error('boom'))).toBe(
      'Não foi possível consultar o produto. Tente de novo.',
    );
  });
});

describe('formularioAPartirDaFicha', () => {
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
    const form = formularioAPartirDaFicha(acucar);

    // `''` e não `'0'`: zero pré-preenchido é aceito sem ler, e aí o macro
    // errado entra no histórico com cara de conferido.
    expect(form.proteinG).toBe('');
    expect(form.fatG).toBe('');
    expect(form.proteinG).not.toBe('0');
  });

  it('converte o que veio para a porção do rótulo', () => {
    const form = formularioAPartirDaFicha(acucar);

    expect(form.grams).toBe('5');
    expect(form.kcal).toBe('20');
    expect(form.carbsG).toBe('5');
  });

  it('cai em 100 quando não há porção conhecida', () => {
    const form = formularioAPartirDaFicha({ ...acucar, servingSize: null });
    expect(form.grams).toBe('100');
    expect(form.kcal).toBe('400');
  });

  it('preserva o zero que a ficha declarou', () => {
    // Zero declarado é dado; zero ausente é chute. Só o segundo vira vazio.
    const form = formularioAPartirDaFicha({ ...acucar, fatPer100g: 0, servingSize: 100 });
    expect(form.fatG).toBe('0');
  });

  it('sem nome, o campo fica vazio para a pessoa preencher', () => {
    const form = formularioAPartirDaFicha({ barcode: '789', basis: '100g', name: undefined });
    expect(form.name).toBe('');
  });
});

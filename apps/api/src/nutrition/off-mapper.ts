/**
 * Tradução da ficha do Open Food Facts para o formato que o app consome.
 *
 * Função pura, isolada do HTTP de propósito: é aqui que mora a única regra que
 * pode estragar dado de forma permanente — **campo ausente nunca vira zero**.
 * O OFF é colaborativo e ficha incompleta é comum; devolver `proteinPer100g = 0`
 * porque veio `undefined` produziria macro errado em silêncio em toda refeição
 * futura daquele produto. Quando falta qualquer macro básico, o resultado é
 * `incomplete` e a decisão volta para o usuário, com o que veio pré-preenchido.
 *
 * Licença do dado: ODbL 1.0 (ADR 017).
 */

/** Sobre o que os macros são declarados. Bebida no OFF vem por 100 ml. */
export type BaseNutricional = '100g' | '100ml';

/** Campos que o app precisa para montar o item de refeição. */
export interface ProdutoDoOff {
  barcode: string;
  name: string;
  brand: string | null;
  /** Se for `100ml`, os quatro campos abaixo são por 100 ml, não por 100 g. */
  basis: BaseNutricional;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** Uma porção do rótulo, **na mesma unidade do `basis`** — ou `null`. */
  servingSize: number | null;
  /** Texto da porção como está no rótulo ("1 unidade (25 g)"). */
  servingLabel: string | null;
}

/** Mesma forma, com tudo opcional — serve para pré-preencher o cadastro manual. */
export type ProdutoParcialDoOff = Partial<Omit<ProdutoDoOff, 'barcode' | 'basis'>> & {
  barcode: string;
  basis: BaseNutricional;
};

export type ResultadoDoMapeamento =
  | { status: 'ok'; product: ProdutoDoOff }
  | { status: 'incomplete'; missing: string[]; partial: ProdutoParcialDoOff };

/**
 * Tetos de sanidade. Não são preciosismo: o erro mais comum de preenchimento no
 * OFF é digitar o valor da porção no campo por 100 g, e um valor acima do teto
 * da gordura pura (900 kcal/100 g) é dado impossível, não dado alto. Passar isso
 * adiante seria pior que não ter o produto.
 */
const MAX_KCAL_100G = 1000;
const MAX_MACRO_100G = 100;
/** Uma "porção" de mais de 2 kg (ou 2 l) é erro de leitura, não porção. */
const MAX_PORCAO = 2000;

const KJ_POR_KCAL = 4.184;

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null;
}

/**
 * O OFF devolve número ou string numérica no mesmo campo, dependendo do produto
 * e de quem preencheu.
 */
function comoNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function comoTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

function dentroDaFaixa(valor: number | null, max: number): number | null {
  if (valor === null) return null;
  return valor >= 0 && valor <= max ? valor : null;
}

/**
 * `product_name_pt` primeiro: a base é internacional e o mesmo código traz o
 * nome em vários idiomas. O genérico entra só como último recurso porque é
 * categoria ("leite condensado"), não produto.
 */
function extrairNome(produto: Record<string, unknown>): string | null {
  return (
    comoTexto(produto.product_name_pt) ??
    comoTexto(produto.product_name_pt_br) ??
    comoTexto(produto.product_name) ??
    comoTexto(produto.generic_name) ??
    null
  );
}

/** `brands` vem como lista separada por vírgula; a primeira é a marca do rótulo. */
function extrairMarca(produto: Record<string, unknown>): string | null {
  const bruto = comoTexto(produto.brands);
  if (!bruto) return null;
  return comoTexto(bruto.split(',')[0]);
}

/**
 * Bebida no OFF declara o rótulo por 100 ml e mesmo assim guarda os valores nos
 * campos `*_100g`. Ler `nutrition_data_per` é o que impede o app de anunciar
 * "42 kcal por 100 g" para um refrigerante cujo rótulo diz por 100 ml.
 */
export function extrairBase(produto: Record<string, unknown>): BaseNutricional {
  const declarado = comoTexto(produto.nutrition_data_per)?.toLowerCase();
  return declarado === '100ml' ? '100ml' : '100g';
}

/**
 * kcal por 100 g/ml. Quando o rótulo só traz kJ — comum em produto europeu — a
 * conversão é feita: 1 kcal = 4,184 kJ é definição, não estimativa.
 */
export function extrairKcal(nutrimentos: Record<string, unknown>): number | null {
  const kcal = dentroDaFaixa(comoNumero(nutrimentos['energy-kcal_100g']), MAX_KCAL_100G);
  if (kcal !== null) return kcal;

  const kj = comoNumero(nutrimentos['energy-kj_100g']);
  if (kj === null) return null;
  return dentroDaFaixa(Math.round((kj / KJ_POR_KCAL) * 10) / 10, MAX_KCAL_100G);
}

const UNIDADE_DA_BASE: Record<BaseNutricional, 'g' | 'ml'> = { '100g': 'g', '100ml': 'ml' };

/**
 * Tamanho da porção do rótulo, **só quando a unidade bate com a da base**.
 *
 * Uma porção de "200 ml" num produto declarado por 100 g fica `null` de
 * propósito: casar as duas exigiria densidade, e chutar 1 g/ml para óleo é errar
 * com aparência de precisão. Nesse caso o app oferece a quantidade padrão e a
 * entrada manual.
 */
export function extrairPorcao(
  produto: Record<string, unknown>,
  base: BaseNutricional,
): number | null {
  const esperada = UNIDADE_DA_BASE[base];

  const unidade = comoTexto(produto.serving_quantity_unit)?.toLowerCase();
  if (unidade !== undefined) {
    // Unidade declarada e diferente da base encerra aqui: cair no texto livre
    // reintroduziria a conversão que este ramo acabou de recusar.
    if (unidade !== esperada) return null;
    const quantidade = comoNumero(produto.serving_quantity);
    if (quantidade !== null && quantidade > 0 && quantidade <= MAX_PORCAO) return quantidade;
  }

  const texto = comoTexto(produto.serving_size);
  if (!texto) return null;

  // `(?![a-z])` impede que "0,5 kg" case como "5 g" e que "1 gelatina" case
  // como "1 g" — a unidade tem de terminar ali.
  const padrao =
    esperada === 'g'
      ? /(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramas?)(?![a-z])/i
      : /(\d+(?:[.,]\d+)?)\s*(?:ml|mls|mililitros?)(?![a-z])/i;
  const casado = padrao.exec(texto);
  if (!casado) return null;

  const quantidade = Number(casado[1].replace(',', '.'));
  if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > MAX_PORCAO) return null;
  return quantidade;
}

/**
 * Mapeia a resposta bruta do OFF. `bruto` é o corpo inteiro do endpoint v2
 * (`{ status, product }`), não o produto solto.
 */
export function mapearProdutoDoOff(bruto: unknown, barcode: string): ResultadoDoMapeamento {
  const corpo = comoObjeto(bruto);
  const produto = comoObjeto(corpo?.product) ?? {};
  const nutrimentos = comoObjeto(produto.nutriments) ?? {};

  const basis = extrairBase(produto);
  const parcial: ProdutoParcialDoOff = { barcode, basis };

  const nome = extrairNome(produto);
  if (nome) parcial.name = nome;

  parcial.brand = extrairMarca(produto);

  const kcal = extrairKcal(nutrimentos);
  if (kcal !== null) parcial.kcalPer100g = kcal;

  const proteina = dentroDaFaixa(comoNumero(nutrimentos.proteins_100g), MAX_MACRO_100G);
  if (proteina !== null) parcial.proteinPer100g = proteina;

  const carboidrato = dentroDaFaixa(comoNumero(nutrimentos.carbohydrates_100g), MAX_MACRO_100G);
  if (carboidrato !== null) parcial.carbsPer100g = carboidrato;

  const gordura = dentroDaFaixa(comoNumero(nutrimentos.fat_100g), MAX_MACRO_100G);
  if (gordura !== null) parcial.fatPer100g = gordura;

  parcial.servingSize = extrairPorcao(produto, basis);
  parcial.servingLabel = comoTexto(produto.serving_size);

  const faltando: string[] = [];
  if (parcial.name === undefined) faltando.push('name');
  if (parcial.kcalPer100g === undefined) faltando.push('kcalPer100g');
  if (parcial.proteinPer100g === undefined) faltando.push('proteinPer100g');
  if (parcial.carbsPer100g === undefined) faltando.push('carbsPer100g');
  if (parcial.fatPer100g === undefined) faltando.push('fatPer100g');

  if (faltando.length > 0) return { status: 'incomplete', missing: faltando, partial: parcial };

  return {
    status: 'ok',
    product: {
      barcode,
      name: parcial.name as string,
      brand: parcial.brand ?? null,
      basis,
      kcalPer100g: parcial.kcalPer100g as number,
      proteinPer100g: parcial.proteinPer100g as number,
      carbsPer100g: parcial.carbsPer100g as number,
      fatPer100g: parcial.fatPer100g as number,
      servingSize: parcial.servingSize ?? null,
      servingLabel: parcial.servingLabel ?? null,
    },
  };
}

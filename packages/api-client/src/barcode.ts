import { ApiError } from './http';
import { customFoodFromForm, type CustomFoodParse } from './custom-food';
import type { Food, PartialScannedProduct, ScannedProduct } from './nutrition';

/**
 * Lógica pura do scanner de código de barras (#140), comum ao PWA e ao app.
 *
 * Fica fora dos componentes porque o que pode dar errado no scanner (leitura
 * repetida, porção chutada, ficha incompleta virando zero) não aparece na tela,
 * aparece no histórico da pessoa três semanas depois. E fica aqui, e não em
 * cada app, porque a web e o celular divergindo nessas regras é exatamente esse
 * tipo de erro.
 */

/** Mesma regra da API (`off-food.service.ts`): só dígitos, de 8 a 14. */
const VALID_BARCODE = /^\d{8,14}$/;

export function isValidBarcode(code: string): boolean {
  return VALID_BARCODE.test(code);
}

/**
 * A câmera entrega o mesmo código várias vezes por segundo enquanto ele estiver
 * enquadrado. Sem esta trava, um único produto viraria dezenas de requisições e
 * o painel reabriria em cima de si mesmo.
 */
export function canProcessScan(code: string, alreadyProcessed: string | null): boolean {
  return isValidBarcode(code) && code !== alreadyProcessed;
}

/** Por que o painel do produto fechou. */
export type ScanCloseReason = 'dismissed' | 'rescan';

/**
 * Trava de leitura depois que o painel fecha.
 *
 * `dismissed` é o "Cancelar": a trava **se mantém**. Zerá-la ali fazia a câmera
 * — que continua apontada para a mesma embalagem — reler o código no mesmo
 * instante, ser servida pelo cache em milissegundos e reabrir o painel que a
 * pessoa acabou de fechar.
 *
 * `rescan` é o "Ler outro": aí a liberação é o gesto pedido, e o mesmo código
 * volta a valer.
 */
export function lockAfterClose(current: string | null, reason: ScanCloseReason): string | null {
  return reason === 'dismissed' ? current : null;
}

export type BaseUnit = 'g' | 'ml';

export function baseUnit(basis: ScannedProduct['basis']): BaseUnit {
  return basis === '100ml' ? 'ml' : 'g';
}

export interface ServingOption {
  label: string;
  amount: number;
}

/**
 * Atalhos de quantidade, na unidade do rótulo.
 *
 * A porção do rótulo vem primeiro porque é o que a pessoa costuma comer — uma
 * colher de leite condensado, não 100 g dele. Quando o rótulo não diz a porção
 * de forma que dê para saber, sobra só a quantidade padrão e o campo manual:
 * inventar a conversão seria errar com aparência de precisão.
 */
export function servingOptions(product: {
  basis: ScannedProduct['basis'];
  servingSize: number | null;
}): ServingOption[] {
  const unit = baseUnit(product.basis);
  const standard: ServingOption = { label: `100 ${unit}`, amount: 100 };
  const serving = product.servingSize;

  if (serving === null || serving <= 0) return [standard];
  // Porção de exatamente 100 duplicaria o botão.
  if (serving === 100) return [{ label: `1 porção (100 ${unit})`, amount: 100 }];

  return [{ label: `1 porção (${serving} ${unit})`, amount: serving }, standard];
}

export interface ProductPreview {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

type Per100 = Pick<
  ScannedProduct,
  'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'
>;

/** Aceita vírgula decimal: é o que o teclado brasileiro digita. */
function parseNumber(value: string | number): number {
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  return trimmed === '' ? NaN : Number(trimmed.replace(',', '.'));
}

/** Macros na quantidade escolhida. O rótulo é por 100 (g ou ml), daí a regra de três. */
export function productPreview(product: Per100, amount: string | number): ProductPreview | null {
  const q = parseNumber(amount);
  if (!Number.isFinite(q) || q <= 0) return null;
  const ratio = q / 100;
  return {
    kcal: Math.round(product.kcalPer100g * ratio),
    proteinG: Math.round(product.proteinPer100g * ratio * 10) / 10,
    carbsG: Math.round(product.carbsPer100g * ratio * 10) / 10,
    fatG: Math.round(product.fatPer100g * ratio * 10) / 10,
  };
}

/** Limite de `MealItemInputDto.foodName` e do nome de `Food` na API. Passar disso é 400. */
const MAX_NAME = 160;

const clampName = (name: string) =>
  name.length > MAX_NAME ? name.slice(0, MAX_NAME).trimEnd() : name;

/**
 * Nome que vai para o histórico. A marca entra porque "Leite Condensado" sem
 * "Moça" não distingue duas fichas diferentes na lista de refeições.
 */
export function productName(product: { name: string; brand?: string | null }): string {
  const brand = product.brand?.trim();
  const full =
    brand && !product.name.toLowerCase().includes(brand.toLowerCase())
      ? `${product.name} (${brand})`
      : product.name;
  return clampName(full);
}

export interface ScannedMealItem {
  foodName: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Item de refeição a partir do produto lido.
 *
 * Vai como **item livre** (sem `foodId`): a consulta ao Open Food Facts não
 * persiste `Food` nenhum — ver ADR 017 — e os macros viajam junto, congelados
 * como o rótulo estava no dia.
 *
 * Para bebida (rótulo por 100 ml) a quantidade em ml é registrada como grama.
 * É aproximação assumida: a densidade de refrigerante, suco e leite fica entre
 * 1,0 e 1,05, e a alternativa — recusar toda bebida — tiraria do scanner
 * justamente a categoria que a ADR 016 apontou como lacuna. A tela avisa.
 */
export function mealItemFromProduct(product: ScannedProduct, amount: number): ScannedMealItem {
  const preview = productPreview(product, amount);
  if (preview === null) throw new Error('Quantidade inválida');
  return { foodName: productName(product), grams: amount, ...preview };
}

const FIELD_LABEL: Record<string, string> = {
  name: 'nome',
  kcalPer100g: 'calorias',
  proteinPer100g: 'proteína',
  carbsPer100g: 'carboidrato',
  fatPer100g: 'gordura',
};

/**
 * O que dizer quando a ficha do OFF veio incompleta.
 *
 * A mensagem nomeia os campos porque a alternativa — "ficha incompleta" — deixa
 * a pessoa procurando no rótulo o que já veio preenchido.
 */
export function incompleteProductMessage(missing: string[]): string {
  const names = missing.map((field) => FIELD_LABEL[field] ?? field);
  if (names.length === 0) return 'Confira os valores no rótulo antes de salvar.';
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `A ficha do Open Food Facts está sem ${list}. Confira no rótulo e complete abaixo.`;
}

export const UNKNOWN_BARCODE_MESSAGE =
  'Esse código não está no Open Food Facts. Cadastre o produto pelo rótulo.';
export const OFF_UNAVAILABLE_MESSAGE =
  'O Open Food Facts não respondeu. Tente de novo ou cadastre pelo rótulo.';

/**
 * Erro da consulta traduzido.
 *
 * 404 e 503 levam ao mesmo cadastro, mas não à mesma frase: "não existe lá" é
 * definitivo e "não respondeu" convida a tentar de novo. Trocar um pelo outro
 * faz a pessoa recadastrar à mão um produto que o OFF conhece.
 */
export function lookupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return UNKNOWN_BARCODE_MESSAGE;
    if (error.status === 503) return OFF_UNAVAILABLE_MESSAGE;
    if (error.status === 400)
      return 'Código de barras inválido. Confira os números e tente de novo.';
  }
  return 'Não foi possível consultar o produto. Tente de novo.';
}

export interface ProductForm {
  name: string;
  /** Quantidade a registrar, na unidade da base. */
  grams: string;
  /** Os quatro abaixo são **por 100**, como no rótulo — não totais da porção. */
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

/**
 * Valores iniciais do cadastro a partir do que o OFF trouxe.
 *
 * Duas regras, e as duas custaram caro:
 *
 * 1. Campo ausente vira **string vazia**, nunca `'0'`: o zero pré-preenchido é
 *    aceito sem ler, e aí o macro errado entra no histórico com cara de
 *    conferido.
 * 2. Os macros ficam **por 100**, a unidade em que o OFF os entrega e a coluna
 *    que todo rótulo brasileiro é obrigado a ter. Convertidos para a porção,
 *    `kcal` só valeria para a quantidade daquele instante: mudar a quantidade
 *    de 5 g para 50 g manteria as 20 kcal e gravaria dez vezes menos. Por 100 o
 *    significado é fixo e a conversão acontece num lugar só,
 *    em `mealItemFromProductForm`.
 */
export function productFormFromPartial(partial: PartialScannedProduct): ProductForm {
  const per100 = (value: number | undefined): string => (value === undefined ? '' : String(value));

  return {
    name: partial.name ? productName({ name: partial.name, brand: partial.brand }) : '',
    grams: String(partial.servingSize ?? 100),
    kcal: per100(partial.kcalPer100g),
    proteinG: per100(partial.proteinPer100g),
    carbsG: per100(partial.carbsPer100g),
    fatG: per100(partial.fatPer100g),
  };
}

function per100FromForm(values: ProductForm): Per100 | null {
  const read = (text: string) => {
    const n = parseNumber(text);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const kcalPer100g = read(values.kcal);
  const proteinPer100g = read(values.proteinG);
  const carbsPer100g = read(values.carbsG);
  const fatPer100g = read(values.fatG);
  if (
    kcalPer100g === null ||
    proteinPer100g === null ||
    carbsPer100g === null ||
    fatPer100g === null
  ) {
    return null;
  }
  return { kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g };
}

/**
 * Item de refeição a partir do formulário da ficha incompleta — ou `null`
 * enquanto faltar qualquer campo.
 *
 * `null` em vez de um payload com buraco é o que fecha o caminho do zero
 * silencioso: `MealService` grava `kcal: item.kcal ?? 0` (idem os outros três),
 * então macro em branco que chegue à API vira zero no histórico.
 *
 * A mesma função monta o payload e decide se o botão habilita, de propósito: as
 * duas regras eram separadas antes, e foi por aí que divergiram.
 */
export function mealItemFromProductForm(values: ProductForm): ScannedMealItem | null {
  const name = values.name.trim();
  if (name.length === 0) return null;

  const amount = parseNumber(values.grams);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const per100 = per100FromForm(values);
  if (per100 === null) return null;

  const preview = productPreview(per100, amount);
  if (preview === null) return null;

  return { foodName: clampName(name), grams: amount, ...preview };
}

/** Teto da medida na API (`FoodPortion.grams`). */
const MAX_SERVING_GRAMS = 2000;

/**
 * Alimento próprio a partir do produto lido, para "Guardar em Meus alimentos".
 *
 * Passa por `customFoodFromForm` para valer a mesma régua da API: o OFF aceita
 * até 1000 kcal em 100 g e o cadastro só 900, e é melhor o aviso aparecer no
 * painel do que como 400 depois do toque. A porção do rótulo vira a medida
 * "porção", e daí o seletor de quantidade oferece "1 porção (30 g)" na próxima
 * vez.
 */
export function customFoodFromProduct(product: ScannedProduct): CustomFoodParse {
  const parsed = customFoodFromForm({
    name: productName(product),
    basis: '100g',
    servingGrams: '',
    kcal: String(product.kcalPer100g),
    protein: String(product.proteinPer100g),
    carbs: String(product.carbsPer100g),
    fat: String(product.fatPer100g),
  });
  const serving = product.servingSize;
  if (parsed.ok && serving !== null && serving > 0 && serving <= MAX_SERVING_GRAMS) {
    parsed.input.portions = [{ label: 'porção', grams: serving }];
  }
  return parsed;
}

/** O mesmo, para a ficha incompleta completada à mão. */
export function customFoodFromProductForm(values: ProductForm): CustomFoodParse {
  return customFoodFromForm({
    name: values.name,
    basis: '100g',
    servingGrams: '',
    kcal: values.kcal,
    protein: values.proteinG,
    carbs: values.carbsG,
    fat: values.fatG,
  });
}

const comparable = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * O alimento próprio que já guarda esse produto, se houver.
 *
 * Sem isto, ler de novo um produto guardado e marcar "Guardar" esbarraria no
 * nome único da API (409). Com isto, a segunda leitura usa o que já existe e o
 * item entra ligado ao mesmo alimento — o que mantém recentes e favoritos.
 */
export function findSavedProduct<T extends Pick<Food, 'name'>>(
  customFoods: readonly T[],
  name: string,
): T | undefined {
  const target = comparable(name);
  return customFoods.find((food) => comparable(food.name) === target);
}

/**
 * Item ligado ao alimento guardado, na quantidade escolhida no painel.
 *
 * Quando a quantidade é exatamente uma medida do alimento (a "porção" que veio
 * do rótulo), vai como `portionId` + 1: no histórico aparece "1 porção (30 g)",
 * que é como a pessoa pensa no que comeu. Fora isso, gramas.
 */
export function savedProductItem(
  food: Pick<Food, 'id' | 'portions'>,
  grams: number,
): { foodId: number; grams: number } | { foodId: number; portionId: string; quantity: number } {
  const portion = food.portions?.find((p) => p.grams === grams);
  return portion
    ? { foodId: food.id, portionId: portion.id, quantity: 1 }
    : { foodId: food.id, grams };
}

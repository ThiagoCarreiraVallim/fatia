import { ApiError, type PartialScannedProduct, type ScannedProduct } from '@fatia/api-client';

/**
 * Lógica pura do scanner de código de barras (#140).
 *
 * Fica fora do componente pelo mesmo motivo de `helpers.ts`: é o único pedaço
 * testável sem renderizar React Native (ver `vitest.config.ts`) — e aqui isso
 * pesa mais que o normal, porque o que pode dar errado no scanner (leitura
 * repetida, porção chutada, ficha incompleta virando zero) não aparece na tela,
 * aparece no histórico da pessoa três semanas depois.
 */

/**
 * Formatos lidos. EAN-13 cobre praticamente todo produto de mercado brasileiro
 * (prefixo 789/790); EAN-8 aparece em embalagem pequena e UPC em importado.
 *
 * A lista é fechada de propósito: deixar o QR Code ligado faz a câmera disparar
 * com qualquer adesivo de propaganda apontado sem querer.
 */
export const TIPOS_DE_CODIGO = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** Mesma regra da API (`off-food.service.ts`): só dígitos, de 8 a 14. */
const CODIGO_VALIDO = /^\d{8,14}$/;

export function codigoDeBarrasValido(codigo: string): boolean {
  return CODIGO_VALIDO.test(codigo);
}

/**
 * A câmera chama `onBarcodeScanned` várias vezes por segundo enquanto o código
 * estiver enquadrado. Sem esta trava, um único produto viraria dezenas de
 * requisições e o drawer reabriria em cima de si mesmo.
 */
export function podeProcessarLeitura(codigo: string, jaProcessado: string | null): boolean {
  return codigoDeBarrasValido(codigo) && codigo !== jaProcessado;
}

export type UnidadeDaBase = 'g' | 'ml';

export function unidadeDaBase(basis: ScannedProduct['basis']): UnidadeDaBase {
  return basis === '100ml' ? 'ml' : 'g';
}

export interface OpcaoDePorcao {
  rotulo: string;
  quantidade: number;
}

/**
 * Atalhos de quantidade, na unidade do rótulo.
 *
 * A porção do rótulo vem primeiro porque é o que a pessoa costuma comer — uma
 * colher de leite condensado, não 100 g dele. Quando o rótulo não diz a porção
 * de forma que dê para saber (texto livre, ou volume num produto por 100 g),
 * sobra só a quantidade padrão e o campo manual: inventar a conversão seria
 * errar com aparência de precisão.
 */
export function opcoesDePorcao(produto: {
  basis: ScannedProduct['basis'];
  servingSize: number | null;
  servingLabel?: string | null;
}): OpcaoDePorcao[] {
  const unidade = unidadeDaBase(produto.basis);
  const padrao: OpcaoDePorcao = { rotulo: `100 ${unidade}`, quantidade: 100 };
  const porcao = produto.servingSize;

  if (porcao === null || porcao <= 0) return [padrao];
  // Porção de exatamente 100 duplicaria o botão.
  if (porcao === 100) return [{ rotulo: `1 porção (100 ${unidade})`, quantidade: 100 }];

  return [{ rotulo: `1 porção (${porcao} ${unidade})`, quantidade: porcao }, padrao];
}

export interface PreviaDoProduto {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Macros do produto na quantidade escolhida. O rótulo é por 100 (g ou ml), daí
 * a regra de três.
 */
export function previaDoProduto(
  produto: Pick<ScannedProduct, 'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'>,
  quantidade: string | number,
): PreviaDoProduto | null {
  const q = typeof quantidade === 'number' ? quantidade : Number(quantidade);
  if (!Number.isFinite(q) || q <= 0) return null;
  const proporcao = q / 100;
  return {
    kcal: Math.round(produto.kcalPer100g * proporcao),
    proteinG: Math.round(produto.proteinPer100g * proporcao * 10) / 10,
    carbsG: Math.round(produto.carbsPer100g * proporcao * 10) / 10,
    fatG: Math.round(produto.fatPer100g * proporcao * 10) / 10,
  };
}

/** Limite de `MealItemInputDto.foodName` na API. Passar disso é 400. */
const MAX_NOME = 160;

/**
 * Nome que vai para o histórico. A marca entra porque "Leite Condensado" sem
 * "Moça" não distingue duas fichas diferentes na lista de refeições.
 */
export function nomeDoProduto(produto: { name: string; brand?: string | null }): string {
  const marca = produto.brand?.trim();
  const completo =
    marca && !produto.name.toLowerCase().includes(marca.toLowerCase())
      ? `${produto.name} (${marca})`
      : produto.name;
  return completo.length > MAX_NOME ? completo.slice(0, MAX_NOME).trimEnd() : completo;
}

/**
 * Item de refeição a partir do produto escaneado.
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
export function itemDeRefeicaoDoProduto(
  produto: ScannedProduct,
  quantidade: number,
): {
  foodName: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  const previa = previaDoProduto(produto, quantidade);
  if (previa === null) throw new Error('Quantidade inválida');
  return {
    foodName: nomeDoProduto(produto),
    grams: quantidade,
    kcal: previa.kcal,
    proteinG: previa.proteinG,
    carbsG: previa.carbsG,
    fatG: previa.fatG,
  };
}

const ROTULO_DO_CAMPO: Record<string, string> = {
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
export function mensagemDeFichaIncompleta(faltando: string[]): string {
  const nomes = faltando.map((campo) => ROTULO_DO_CAMPO[campo] ?? campo);
  if (nomes.length === 0) return 'Confira os valores no rótulo antes de salvar.';
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `A ficha do Open Food Facts está sem ${lista}. Confira no rótulo e complete abaixo.`;
}

export const MENSAGEM_CODIGO_DESCONHECIDO =
  'Esse código não está no Open Food Facts. Cadastre o produto pelo rótulo.';
export const MENSAGEM_OFF_INDISPONIVEL =
  'O Open Food Facts não respondeu. Tente de novo ou cadastre pelo rótulo.';

/**
 * Erro da consulta traduzido.
 *
 * 404 e 503 levam ao mesmo formulário, mas não à mesma frase: "não existe lá" é
 * definitivo e "não respondeu" convida a tentar de novo. Trocar um pelo outro
 * faz a pessoa recadastrar à mão um produto que o OFF conhece.
 */
export function mensagemDeFalhaNaConsulta(erro: unknown): string {
  if (erro instanceof ApiError) {
    if (erro.status === 404) return MENSAGEM_CODIGO_DESCONHECIDO;
    if (erro.status === 503) return MENSAGEM_OFF_INDISPONIVEL;
    if (erro.status === 400) return 'Código de barras inválido. Tente escanear de novo.';
  }
  return 'Não foi possível consultar o produto. Tente de novo.';
}

/**
 * Valores iniciais do cadastro manual a partir do que o OFF trouxe.
 *
 * Campo ausente vira **string vazia**, nunca `'0'`: o zero pré-preenchido é
 * aceito sem ler, e aí o macro errado entra no histórico com cara de conferido.
 */
export function formularioAPartirDaFicha(parcial: PartialScannedProduct): {
  name: string;
  grams: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
} {
  const quantidade = parcial.servingSize ?? 100;
  const porCem = (valor: number | undefined): string =>
    valor === undefined ? '' : String(Math.round(valor * (quantidade / 100) * 10) / 10);

  return {
    name: parcial.name ? nomeDoProduto({ name: parcial.name, brand: parcial.brand }) : '',
    grams: String(quantidade),
    kcal: porCem(parcial.kcalPer100g),
    proteinG: porCem(parcial.proteinPer100g),
    carbsG: porCem(parcial.carbsPer100g),
    fatG: porCem(parcial.fatPer100g),
  };
}

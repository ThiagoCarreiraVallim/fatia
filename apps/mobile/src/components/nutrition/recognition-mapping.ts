import type { MealRecognition, RecognizedFoodItem, nutritionApi } from '@fatia/api-client';
import { parsePositivo } from './helpers';

/**
 * Lógica pura da tela de confirmação do reconhecimento por foto (#139).
 *
 * Fica fora do componente porque é o único pedaço testável sem renderizar React
 * Native (ver `vitest.config.ts`) — e porque é aqui que mora a regra que protege
 * o histórico: **o que a IA sugeriu só vira refeição depois de a pessoa
 * confirmar**, e o que ela desmarcar ou não puder completar não vai.
 */

type ItemDaRefeicao = Parameters<typeof nutritionApi.addItem>[1];

/** Item da lista de confirmação: a sugestão, mais o que a pessoa mexeu. */
export interface ItemEditavel {
  /** Chave estável da lista. O nome repete — "arroz" duas vezes acontece. */
  chave: string;
  nomeReconhecido: string;
  foodId: number | null;
  nomeDoCatalogo: string | null;
  confidence: number;
  estimado: boolean;
  /** Texto, não número: o campo é editável e "12," é um estado intermediário. */
  gramas: string;
  /** Marcado = entra na refeição. Nasce marcado; desmarcar é um toque. */
  incluido: boolean;
  /** Macros da sugestão, para a porção original. `null` = a pessoa preenche. */
  macrosPorGrama: MacrosPorGrama | null;
}

interface MacrosPorGrama {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const arredondar = (n: number) => Math.round(n * 100) / 100;

/**
 * Resposta da API → itens editáveis.
 *
 * Item **casado** com a TACO não guarda macro aqui: quem calcula é a API, a
 * partir de `foodId` e das gramas finais. Guardar uma cópia faria o valor
 * exibido divergir do gravado assim que a pessoa mudasse a porção — dois números
 * para a mesma coisa é como se grava macro errado sem ninguém notar.
 *
 * Item **estimado** guarda o macro por grama, porque não há catálogo de onde
 * recalcular: mudar a porção reescala a estimativa, que é o melhor disponível.
 */
export function itensEditaveis(resposta: MealRecognition): ItemEditavel[] {
  return resposta.itens.map((item, indice) => ({
    chave: `${indice}-${item.nomeReconhecido}`,
    nomeReconhecido: item.nomeReconhecido,
    foodId: item.foodId,
    nomeDoCatalogo: item.nomeDoCatalogo,
    confidence: item.confidence,
    estimado: item.estimado,
    gramas: String(arredondar(item.grams)),
    incluido: true,
    macrosPorGrama: macrosPorGrama(item),
  }));
}

function macrosPorGrama(item: RecognizedFoodItem): MacrosPorGrama | null {
  if (item.foodId !== null) return null;
  if (item.kcal === null || item.proteinG === null || item.carbsG === null || item.fatG === null) {
    return null;
  }
  if (!(item.grams > 0)) return null;
  return {
    kcal: item.kcal / item.grams,
    proteinG: item.proteinG / item.grams,
    carbsG: item.carbsG / item.grams,
    fatG: item.fatG / item.grams,
  };
}

/** Prévia dos macros do item na porção digitada. `null` quando não dá para saber. */
export function previaDoItem(item: ItemEditavel): MacrosPorGrama | null {
  const gramas = parsePositivo(item.gramas);
  if (gramas === null || !item.macrosPorGrama) return null;
  const p = item.macrosPorGrama;
  return {
    kcal: Math.round(p.kcal * gramas),
    proteinG: Math.round(p.proteinG * gramas),
    carbsG: Math.round(p.carbsG * gramas),
    fatG: Math.round(p.fatG * gramas),
  };
}

/**
 * Um item pode ser gravado? Item livre sem macro nenhum, não — ele iria para a
 * refeição valendo zero caloria, que é indistinguível de um dado real.
 */
export function podeGravar(item: ItemEditavel): boolean {
  if (parsePositivo(item.gramas) === null) return false;
  return item.foodId !== null || item.macrosPorGrama !== null;
}

/** Itens marcados que também podem ser gravados. */
export function itensParaGravar(itens: ItemEditavel[]): ItemEditavel[] {
  return itens.filter((item) => item.incluido && podeGravar(item));
}

/**
 * Itens marcados pela pessoa → payload de `createMeal`/`addItem`.
 *
 * Só isto sai da tela. Nada de `confidence`, nada de "estimado": a confiança do
 * modelo serve para a pessoa decidir, e não para virar dado no banco — ela não é
 * calibrada, e um número não calibrado gravado vira um número que alguém acredita.
 */
export function itensDeRefeicao(itens: ItemEditavel[]): ItemDaRefeicao[] {
  return itensParaGravar(itens).map((item) => {
    const gramas = parsePositivo(item.gramas) as number;

    if (item.foodId !== null) {
      // Só `foodId` e `grams`: quem calcula o macro é a API, pela mesma regra do
      // registro manual. É o que faz o item casado ter macro da TACO e não do
      // palpite do modelo.
      return { foodId: item.foodId, grams: gramas };
    }

    const previa = previaDoItem(item) as MacrosPorGrama;
    return {
      foodName: item.nomeReconhecido,
      grams: gramas,
      kcal: previa.kcal,
      proteinG: previa.proteinG,
      carbsG: previa.carbsG,
      fatG: previa.fatG,
    };
  });
}

/** Faixa de confiança, para o rótulo e a cor. */
export type FaixaDeConfianca = 'alta' | 'media' | 'baixa';

export function faixaDeConfianca(confidence: number): FaixaDeConfianca {
  if (confidence >= 0.75) return 'alta';
  if (confidence >= 0.45) return 'media';
  return 'baixa';
}

export const ROTULO_DE_CONFIANCA: Record<FaixaDeConfianca, string> = {
  alta: 'Confiança alta',
  media: 'Confiança média',
  baixa: 'Confiança baixa',
};

/**
 * O que dizer quando a foto não rendeu nada.
 *
 * Nunca é um beco sem saída: a mensagem existe para levar ao registro manual, que
 * é o caminho que sempre funcionou.
 */
export function mensagemDeFotoSemComida(observacao: string | null): string {
  const base = 'Não identifiquei alimentos nesta foto.';
  const complemento = observacao?.trim();
  return complemento ? `${base} ${complemento}` : `${base} Registre pela busca de alimento.`;
}

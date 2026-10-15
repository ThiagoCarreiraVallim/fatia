import type { MealItem } from './nutrition';
import type { StepLog, WaterLog, WeightLog } from './progress';

/**
 * Desfazer de registros pequenos (água, peso, passos, item de refeição).
 *
 * Esses apagam na hora, sem pergunta: quem toca na lixeira de um copo d'água
 * quer o copo fora da lista, e uma confirmação a cada toque só ensina a tocar
 * em "Apagar" sem ler. O preço do erro é pago pelo "Desfazer", que recria o
 * registro a partir do retrato tirado antes de apagar. Refeição inteira, plano,
 * treino e alimento continuam com confirmação: refazer é caro.
 *
 * Recriar gera outro id; nenhuma tela guarda o id antigo depois de apagar.
 */

/** Tempo do aviso com "Desfazer", igual nas duas pontas. */
export const UNDO_MS = 5_000;

export type UndoKind = 'water' | 'weight' | 'steps' | 'mealItem';

const MESSAGE: Record<UndoKind, string> = {
  water: 'Registro de água apagado',
  weight: 'Pesagem apagada',
  steps: 'Registro de passos apagado',
  mealItem: 'Item apagado',
};

export function undoMessage(kind: UndoKind): string {
  return MESSAGE[kind];
}

const notes = (n: string | null | undefined) => (n ? { notes: n } : {});

/** Volta no mesmo dia, mesmo que o dia já não seja hoje. */
export function waterRestoreInput(log: Pick<WaterLog, 'ml' | 'date' | 'notes'>) {
  return { ml: log.ml, date: log.date.slice(0, 10), ...notes(log.notes) };
}

/** Volta no mesmo instante: o gráfico de peso usa a hora para ordenar o dia. */
export function weightRestoreInput(log: Pick<WeightLog, 'weightKg' | 'loggedAt' | 'notes'>) {
  return { weightKg: log.weightKg, loggedAt: log.loggedAt, ...notes(log.notes) };
}

export function stepsRestoreInput(log: Pick<StepLog, 'steps' | 'date' | 'notes'>) {
  return { steps: log.steps, date: log.date.slice(0, 10), ...notes(log.notes) };
}

/**
 * O item volta para a mesma refeição. A refeição não some quando o último item
 * sai, então o `mealId` continua valendo.
 *
 * Com `foodId`, a API recalcula pelas gramas e o nome vai junto para manter um
 * nome editado. A medida caseira ("2 colheres") não volta: a API só a aceita
 * por `portionId`, que o item não guarda; as gramas são as mesmas. Item livre
 * volta com os valores que tinha.
 */
export function mealItemRestoreInput(
  item: Pick<MealItem, 'foodId' | 'foodName' | 'grams' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>,
) {
  if (item.foodId !== null) {
    return { foodId: item.foodId, foodName: item.foodName, grams: item.grams };
  }
  return {
    foodName: item.foodName,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
  };
}

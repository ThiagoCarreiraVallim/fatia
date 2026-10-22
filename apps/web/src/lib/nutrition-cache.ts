import type { QueryClient } from '@tanstack/react-query';

/**
 * O que muda quando uma refeição do dia muda — registrar, editar ou apagar item
 * ou refeição: o resumo do dia, os micronutrientes (o card de metas), o gráfico
 * da semana e o dashboard. As mesmas chaves que o app invalida.
 *
 * Num lugar só porque cada tela invalidava o próprio pedaço: editar um item
 * atualizava o resumo e deixava o gráfico semanal e o card de metas com o valor
 * de antes.
 */
export function invalidateNutritionDay(qc: QueryClient, date: string): void {
  void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
  void qc.invalidateQueries({ queryKey: ['nutrition', 'history'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
}

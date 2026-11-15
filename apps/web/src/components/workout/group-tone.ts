/**
 * A cor de cada grupo muscular nas barras do Treino (cartão do plano, músculos
 * do treino feito). Só tokens do tema: nenhum hex solto.
 */
const GROUP_TONE: Record<string, string> = {
  peito: 'hsl(var(--primary))',
  costas: 'hsl(var(--info))',
  pernas: 'hsl(var(--steps))',
  ombro: 'hsl(var(--warning))',
  braço: 'hsl(var(--protein))',
  core: 'hsl(var(--carbs))',
  cardio: 'hsl(var(--water))',
};

export function groupTone(group: string): string {
  return GROUP_TONE[group] ?? 'hsl(var(--muted-foreground))';
}

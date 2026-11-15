/**
 * A cor de cada grupo muscular no Treino (barras do plano, o quadradinho do
 * grupo no topo da sessão e no Como fazer, os músculos e exercícios do treino
 * feito). As cores do canvas — peito azul, ombro verde-água, braço verde,
 * cardio rosa — e as mesmas do app (`groupColorName`). Só tokens do tema.
 */
const GROUP_TONE: Record<string, string> = {
  peito: 'hsl(var(--protein))',
  costas: 'hsl(var(--water))',
  pernas: 'hsl(var(--primary))',
  ombro: 'hsl(var(--steps))',
  braço: 'hsl(var(--carbs))',
  core: 'hsl(var(--fat))',
  cardio: 'hsl(var(--danger))',
};

export function groupTone(group: string): string {
  return GROUP_TONE[group] ?? 'hsl(var(--muted-foreground))';
}

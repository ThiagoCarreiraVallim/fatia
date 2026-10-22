/**
 * Nomes dos grupos do diagrama em português — o `muscle-labels.ts` do app.
 *
 * A API devolve as chaves em inglês (`chest`, `lower back`) porque é assim que o
 * `data-muscle` do SVG as nomeia. A tradução existe para o rótulo do diagrama,
 * que é a única forma de quem usa leitor de tela saber o que o desenho mostra:
 * "Vista frontal" não dizia quais músculos estavam pintados.
 */
const MUSCLE_LABEL_PT: Record<string, string> = {
  abdominals: 'abdômen',
  abductors: 'abdutores',
  adductors: 'adutores',
  biceps: 'bíceps',
  calves: 'panturrilhas',
  chest: 'peito',
  forearms: 'antebraços',
  glutes: 'glúteos',
  hamstrings: 'posteriores de coxa',
  lats: 'dorsais',
  'lower back': 'lombar',
  'middle back': 'meio das costas',
  neck: 'pescoço',
  quadriceps: 'quadríceps',
  shoulders: 'ombros',
  traps: 'trapézio',
  triceps: 'tríceps',
};

export function muscleLabelPt(muscle: string): string {
  return MUSCLE_LABEL_PT[muscle] ?? muscle;
}

/** Frase que descreve o diagrama para leitor de tela. */
export function describeMuscles(primary: string[], secondary: string[]): string {
  const parts: string[] = [];
  if (primary.length > 0) {
    parts.push(`Músculos principais: ${primary.map(muscleLabelPt).join(', ')}`);
  }
  if (secondary.length > 0) {
    parts.push(`secundários: ${secondary.map(muscleLabelPt).join(', ')}`);
  }
  if (parts.length === 0) return 'Diagrama muscular sem músculos destacados';
  return `Diagrama muscular. ${parts.join('. ')}.`;
}

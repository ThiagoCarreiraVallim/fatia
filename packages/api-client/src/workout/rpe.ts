export interface RpeInfo {
  emoji: string;
  label: string;
  hint: string;
}

const RPE_TABLE: Record<number, RpeInfo> = {
  6: { emoji: '😎', label: 'Fácil', hint: 'Sobraram 4+ reps' },
  7: { emoji: '🙂', label: 'Confortável', hint: 'Sobraram 3 reps' },
  8: { emoji: '😐', label: 'Difícil', hint: 'Sobraram 2 reps' },
  9: { emoji: '😣', label: 'Muito difícil', hint: 'Sobrou 1 rep' },
  10: { emoji: '🥵', label: 'Falha', hint: 'Não consigo mais' },
};

export function getRpeInfo(value: number | null | undefined): RpeInfo | null {
  if (value == null) return null;
  const rounded = Math.round(value);
  return RPE_TABLE[rounded] ?? null;
}

export interface RpeInfo {
  emoji: string;
  label: string;
  hint: string;
}

// Os rótulos da escala de 5 do canvas (#377, `FEELINGS`): a sensação da série
// é o RPE, e a tela fala do mesmo jeito na série, no treino atual e no fim.
const RPE_TABLE: Record<number, RpeInfo> = {
  6: { emoji: '😎', label: 'Leve', hint: 'Sobravam 4 ou mais' },
  7: { emoji: '🙂', label: 'Firme', hint: 'Sobravam 3' },
  8: { emoji: '😐', label: 'Puxado', hint: 'Sobravam 2' },
  9: { emoji: '😣', label: 'Muito puxado', hint: 'Sobrava 1' },
  10: { emoji: '🥵', label: 'No limite', hint: 'Não sobrava nada' },
};

export function getRpeInfo(value: number | null | undefined): RpeInfo | null {
  if (value == null) return null;
  const rounded = Math.round(value);
  return RPE_TABLE[rounded] ?? null;
}

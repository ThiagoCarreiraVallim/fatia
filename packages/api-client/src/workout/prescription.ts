import type { PrescribedSet } from '../workout';

/**
 * Texto da prescrição na tela de sessão ativa.
 *
 * Mora aqui pelo mesmo motivo de `set-prefill.ts`: web e mobile precisam da
 * **mesma** frase, e duas cópias de uma regra de texto são a forma mais barata
 * de recriar a divergência que a auditoria de paridade (#130) fechou.
 *
 * O `reason` não é enfeite. O RPE é opcional e chega depois — quem nunca
 * preenche cai na dupla progressão e recebe um número igualmente correto, mas
 * por outro caminho. Sem dizer qual regra rodou, a pessoa passa a confiar num
 * sinal que ela nunca registrou.
 */
export function describePrescription(prescription: PrescribedSet): {
  label: string;
  reason: string;
} {
  const { weightKg, reps, restSeconds, basis, action, capped } = prescription;
  const label = `Sugestão: ${formatKg(weightKg)} kg × ${reps} · ${restSeconds}s`;

  return {
    label,
    reason: capped ? `${reasonFor(basis, action)} · no teto` : reasonFor(basis, action),
  };
}

function reasonFor(basis: PrescribedSet['basis'], action: PrescribedSet['action']): string {
  if (basis === 'rpe') {
    if (action === 'increase_load') return 'RPE baixo com as reps no topo da faixa';
    if (action === 'increase_reps') return 'RPE moderado — sobe repetição antes de carga';
    return 'RPE alto na última sessão';
  }
  if (action === 'increase_load') return 'sem RPE — todas as séries fecharam a faixa';
  if (action === 'increase_reps') return 'sem RPE — sobe repetição dentro da faixa';
  return 'sem RPE — repete a última sessão';
}

function formatKg(weightKg: number): string {
  return Number.isInteger(weightKg) ? String(weightKg) : weightKg.toFixed(1);
}

import { blockWeekRows, type TrainingBlock, type TrainingBlockKind } from '@fatia/api-client';

/**
 * Contas do bloco de semanas no app (#379, prancha Al-T12) que não dependem de
 * tela. Os três estados do bloco (#370, `Dados-Estados`): em andamento destaca
 * a semana atual, concluído resume, encerrado oferece recomeçar.
 */

export type BlockScreenState = 'plan' | 'active' | 'completed' | 'abandoned';

export const BLOCK_KIND_OPTIONS: Array<{ value: TrainingBlockKind; label: string }> = [
  { value: 'strength', label: 'Força' },
  { value: 'hypertrophy', label: 'Hipertrofia' },
];

const FOCUS_LABEL = { accumulation: 'Acúmulo', peak: 'Pico', deload: 'Deload' } as const;

export function blockScreenState(latest: TrainingBlock | null | undefined): BlockScreenState {
  if (!latest) return 'plan';
  return latest.status;
}

/** As semanas do bloco em andamento, no mesmo desenho das da prévia. */
export function activeWeekRows(block: TrainingBlock) {
  const rows = blockWeekRows(
    block.weeks.map((w) => ({
      weekNumber: w.weekNumber,
      label: FOCUS_LABEL[w.focus],
      intensityFactor: w.intensityFactor,
      volumeFactor: w.volumeFactor,
      sessionsTarget: w.sessionsTarget,
    })),
  );
  return rows.map((row, i) => {
    const w = block.weeks[i]!;
    return {
      ...row,
      current: w.state === 'current',
      state: w.state,
      progress: `${w.sessionsDone} de ${w.sessionsTarget} sessões`,
    };
  });
}

export function blockStatusCopy(block: TrainingBlock): {
  title: string;
  body: string;
  cta: string;
} {
  const head = [block.kindLabel, block.planName].filter(Boolean).join(' · ');
  if (block.status === 'abandoned') {
    const reached = Math.max(
      1,
      ...block.weeks.filter((w) => w.sessionsDone > 0).map((w) => w.weekNumber),
    );
    return {
      title: 'Bloco encerrado antes do fim',
      body: `${head} · parou na semana ${reached} de ${block.weeksTotal}.`,
      cta: 'Recomeçar',
    };
  }
  const done = block.weeks.reduce((s, w) => s + w.sessionsDone, 0);
  const target = block.weeks.reduce((s, w) => s + w.sessionsTarget, 0);
  return {
    title: 'Bloco concluído',
    body: `${head} · ${block.weeksTotal} semanas · ${done} de ${target} sessões. Monte o próximo quando quiser.`,
    cta: 'Montar o próximo bloco',
  };
}

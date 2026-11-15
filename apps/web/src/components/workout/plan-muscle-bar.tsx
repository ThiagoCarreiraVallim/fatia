import {
  muscleGroupName,
  muscleGroupTone,
  muscleShareLabel,
  planMuscleShare,
  type MuscleGroupTone,
} from '@fatia/api-client';
import { cn } from '@/lib/utils';

const TONE_BG: Record<MuscleGroupTone, string> = {
  protein: 'bg-protein',
  water: 'bg-water',
  ok: 'bg-ok',
  steps: 'bg-steps',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  danger: 'bg-danger',
  muted: 'bg-muted-foreground',
};

/**
 * A barra de séries por grupo (Al-T6/Al-T7). Uma imagem com nome para leitor de
 * tela; a legenda embaixo é opcional, porque no card da lista o espaço é curto.
 */
export function PlanMuscleBar({
  exercises,
  legend = false,
  className,
}: {
  exercises: Parameters<typeof planMuscleShare>[0];
  legend?: boolean;
  className?: string;
}) {
  const share = planMuscleShare(exercises);
  if (share.length === 0) return null;
  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        role="img"
        aria-label={muscleShareLabel(share)}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-pill"
      >
        {share.map((s) => (
          <span
            key={s.group}
            className={TONE_BG[muscleGroupTone(s.group)]}
            style={{ width: `${s.percent}%` }}
          />
        ))}
      </div>
      {legend && (
        <ul
          aria-hidden
          className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        >
          {share.map((s) => (
            <li key={s.group} className="flex items-center gap-1">
              <span className={cn('h-2 w-2 rounded-full', TONE_BG[muscleGroupTone(s.group)])} />
              {muscleGroupName(s.group)} {s.percent}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

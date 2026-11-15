import {
  bodyTones,
  daysAgoLabel,
  muscleGroupLabel,
  MUSCLE_TONE_LEGEND,
  type MuscleTone,
  type RestedMuscle,
} from '@fatia/api-client';

/**
 * A silhueta do card "Seus músculos hoje" (prancha `Al-T-Cards-treino`):
 * corpo escuro, cada grupo na cor do descanso. Só tokens — o diagrama
 * anatômico de antes tinha fundo claro e vermelho fixo no código.
 */
const TONE_FILL: Record<MuscleTone, string> = {
  rested: 'hsl(var(--primary))',
  recovering: 'hsl(var(--steps))',
  recent: 'hsl(var(--foreground) / 0.18)',
};

export function BodySilhouette({ rested }: { rested: readonly RestedMuscle[] }) {
  const tone = bodyTones(rested);
  const fill = (g: keyof typeof tone) => TONE_FILL[tone[g]];
  const label = rested.length
    ? rested.map((r) => `${muscleGroupLabel(r.group)} · ${daysAgoLabel(r.daysSince)}`).join(', ')
    : 'Nenhum grupo descansado';
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 120 220"
      width={64}
      height={118}
      className="shrink-0"
    >
      <g fill="hsl(var(--surface-3))">
        <circle cx="60" cy="20" r="14" />
        <rect x="40" y="38" width="40" height="70" rx="16" />
        <rect x="20" y="42" width="16" height="64" rx="8" />
        <rect x="84" y="42" width="16" height="64" rx="8" />
        <rect x="42" y="108" width="16" height="96" rx="8" />
        <rect x="62" y="108" width="16" height="96" rx="8" />
      </g>
      {/* Costas não aparecem de frente: o contorno do tronco leva a cor delas. */}
      <rect
        x="41.5"
        y="39.5"
        width="37"
        height="67"
        rx="15"
        fill="none"
        stroke={fill('costas')}
        strokeWidth="3"
      />
      <rect x="42" y="44" width="36" height="22" rx="8" fill={fill('peito')} />
      <rect x="46" y="70" width="28" height="32" rx="8" fill={fill('core')} />
      <circle cx="32" cy="46" r="9" fill={fill('ombro')} />
      <circle cx="88" cy="46" r="9" fill={fill('ombro')} />
      <rect x="20" y="60" width="16" height="30" rx="8" fill={fill('braço')} />
      <rect x="84" y="60" width="16" height="30" rx="8" fill={fill('braço')} />
      <rect x="42" y="112" width="16" height="56" rx="8" fill={fill('pernas')} />
      <rect x="62" y="112" width="16" height="56" rx="8" fill={fill('pernas')} />
    </svg>
  );
}

export function BodyToneLegend() {
  return (
    <ul aria-label="Legenda" className="flex flex-col gap-1">
      {MUSCLE_TONE_LEGEND.map((item) => (
        <li key={item.tone} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: TONE_FILL[item.tone] }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

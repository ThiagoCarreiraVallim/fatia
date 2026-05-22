import { getRpeInfo } from '@/lib/workout/rpe';

interface Props {
  value: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function RpeBadge({ value, size = 'sm', showLabel = false }: Props) {
  const info = getRpeInfo(value);
  if (!info || value == null) {
    return <span className="text-muted-foreground tabular-nums">—</span>;
  }
  const emojiSize = size === 'md' ? 'text-lg' : 'text-base';
  const numSize = size === 'md' ? 'text-sm' : 'text-xs';
  return (
    <span
      className="inline-flex items-center gap-1 font-bold text-foreground tabular-nums"
      title={`${info.label} — ${info.hint}`}
    >
      <span className={`${emojiSize} leading-none`}>{info.emoji}</span>
      <span className={numSize}>{value}</span>
      {showLabel && <span className="text-xs text-muted-foreground">{info.label}</span>}
    </span>
  );
}

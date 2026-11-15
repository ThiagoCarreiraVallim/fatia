import { initialsOf } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/**
 * A foto da pessoa ou, sem ela, as iniciais (prancha Al-V1/V9). A URL é
 * assinada e curta, então fica fora do otimizador do Next.
 */
export function UserAvatar({
  name,
  url,
  size = 72,
  className,
}: {
  name: string | null | undefined;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.34) };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta, fora do otimizador
      <img
        src={url}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full bg-muted object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand font-display font-bold text-brand-foreground',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

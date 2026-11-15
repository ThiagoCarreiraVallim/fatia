import { cn } from '@/lib/utils';

/**
 * Avatar da comunidade (ADR 028), ou as iniciais quando ela não tem imagem. As
 * iniciais vão sobre o verde cheio: o verde a 10% com texto verde não passa
 * 4,5:1 no tema claro (axe no mobile-light).
 */
export function GroupAvatar({
  name,
  url,
  size = 40,
  className,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const iniciais = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const estilo = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
      <img
        src={url}
        alt=""
        style={estilo}
        className={cn('shrink-0 rounded-xl object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={estilo}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground',
        className,
      )}
    >
      {iniciais}
    </span>
  );
}

/**
 * Casca compartilhada das páginas legais (`/privacy`, `/terms`).
 *
 * Existe para as duas ficarem visualmente idênticas e para o "última atualização"
 * aparecer sempre no mesmo lugar — é o primeiro item que um revisor de conector
 * procura.
 */
export function LegalDoc({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Última atualização: {lastUpdated}</p>
      <div className="mt-8 space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed [&_a]:text-foreground [&_a]:underline [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground [&_ul]:space-y-2">
        {children}
      </div>
    </section>
  );
}

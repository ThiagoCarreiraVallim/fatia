import Link from 'next/link';

/**
 * Route group público — SEM gate de autenticação, ao contrário de `(app)/layout.tsx`.
 *
 * Existe porque Privacidade e Termos precisam ser acessíveis a quem ainda não tem
 * conta: a Anthropic revisa essas páginas na submissão do conector (issue #95), e
 * uma política de privacidade atrás de login não serve para nada.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-border/60 border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-display text-xl font-extrabold">
            Fatia
          </Link>
          <nav className="text-muted-foreground flex gap-5 text-sm">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacidade
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Termos
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-border/60 text-muted-foreground border-t px-6 py-6 text-center text-sm">
        Fatia — software livre.{' '}
        <a
          href="https://github.com/ThiagoCarreiraVallim/fatia"
          className="hover:text-foreground underline transition-colors"
        >
          Código no GitHub
        </a>
        .
      </footer>
    </div>
  );
}

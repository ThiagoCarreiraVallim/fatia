import Link from 'next/link';
import { site } from '@/lib/site';

export function Header() {
  return (
    <header className="border-border/60 sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
          Fatia
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/claude-connect/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Conectar no Claude
          </Link>
          <a
            href={site.appUrl}
            className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Entrar
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-border/60 border-t">
      <div className="text-muted-foreground mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>Fatia — software livre.</p>
        <nav className="flex flex-wrap gap-5">
          <a href={site.privacyUrl} className="hover:text-foreground transition-colors">
            Privacidade
          </a>
          <a href={site.termsUrl} className="hover:text-foreground transition-colors">
            Termos
          </a>
          <a href={site.repoUrl} className="hover:text-foreground transition-colors">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

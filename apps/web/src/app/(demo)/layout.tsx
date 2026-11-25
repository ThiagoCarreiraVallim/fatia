import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Demonstração · Fatia',
  robots: { index: false, follow: false },
};

/**
 * Fora do `(app)`: a sessão de demonstração (#412) não usa o login de quem
 * abre o link, só o token curto da demo. Sem gate do Logto nem navegação.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-6 pb-10">
        <p className="mb-5 text-center font-display text-2xl font-bold text-primary">Fatia</p>
        {children}
      </main>
    </div>
  );
}

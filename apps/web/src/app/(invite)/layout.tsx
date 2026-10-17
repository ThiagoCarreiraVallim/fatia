/**
 * Fora do `(app)`: o link de convite abre para quem ainda não tem conta, então
 * não há gate de login nem barra de navegação — só a marca e o cartão.
 */
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-8 pb-10">
        <p className="mb-6 text-center font-jakarta text-2xl font-bold text-primary">Fatia</p>
        {children}
      </main>
    </div>
  );
}

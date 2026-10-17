import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { OrgShell } from '@/components/org/org-shell';
import { Toaster } from '@/components/ui/toaster';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * Painel da comunidade (Fase 6) — superfície da equipe, separada do app do
 * usuário como o `(pro)`: sem `BottomNav` e com coluna larga no desktop, onde o
 * dono passa mais tempo. O papel é por comunidade, então quem confere é a
 * `OrgShell` (e, de verdade, a API, uma rota por vez).
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <TopBarProvider>
      <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <AppTopBar wide />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl">
            <OrgShell>{children}</OrgShell>
          </div>
        </main>
        <Toaster />
      </div>
    </TopBarProvider>
  );
}

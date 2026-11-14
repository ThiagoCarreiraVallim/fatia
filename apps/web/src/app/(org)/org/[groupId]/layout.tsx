import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { AiDrawerProvider } from '@/components/layout/ai-drawer';
import { BottomNav, BottomSpacer } from '@/components/layout/bottom-nav';
import { RestTimerProvider } from '@/components/workout/rest-timer-provider';
import { OrgShell } from '@/components/org/org-shell';
import { Toaster } from '@/components/ui/toaster';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * Painel da comunidade (Fase 6) — superfície da equipe, com coluna larga no
 * desktop, onde o dono passa mais tempo. O papel é por comunidade, então quem
 * confere é a `OrgShell` (e, de verdade, a API, uma rota por vez).
 *
 * No celular a equipe tem a mesma barra de cinco abas do app, com Comunidade
 * acesa: o painel mora dentro da aba Comunidade (ADR 040 revisada). Os
 * editores do painel são tarefa de foco e escondem a barra (`navBarMode`). O
 * desktop segue com a `OrgShell`; o layout novo do painel é da #398.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AiDrawerProvider>
      <RestTimerProvider>
        <TopBarProvider>
          <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            <AppTopBar wide />
            <main className="flex-1 pb-28 md:pb-0">
              <div className="mx-auto w-full max-w-6xl">
                <OrgShell>{children}</OrgShell>
                <BottomSpacer />
              </div>
            </main>
            <BottomNav />
            <Toaster />
          </div>
        </TopBarProvider>
      </RestTimerProvider>
    </AiDrawerProvider>
  );
}

import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { AiMenuProvider, AiMenuStage } from '@/components/layout/ai-menu';
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
 * editores do painel são tarefa de foco e escondem a barra (`navBarMode`). No
 * computador a `OrgShell` desenha o painel base da #398 (menu lateral, topo
 * com migalha e busca ⌘K) e a barra do app some.
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <AiMenuProvider>
      <RestTimerProvider>
        <TopBarProvider>
          <AiMenuStage>
            <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pt-0 md:pb-0">
              <div className="contents md:hidden">
                <AppTopBar wide />
              </div>
              <div className="flex-1 pb-28 md:pb-0">
                <OrgShell>{children}</OrgShell>
                <BottomSpacer />
              </div>
            </div>
          </AiMenuStage>
          <BottomNav />
          <Toaster />
        </TopBarProvider>
      </RestTimerProvider>
    </AiMenuProvider>
  );
}

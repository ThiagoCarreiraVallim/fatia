import { Toaster } from '@/components/ui/toaster';
import { ChatRuntimeProvider } from '@/components/chat/chat-runtime-provider';
import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { BottomNav, BottomSpacer } from '@/components/layout/bottom-nav';
import { AiMenuProvider, AiMenuStage } from '@/components/layout/ai-menu';
import { RestTimerProvider } from '@/components/workout/rest-timer-provider';
import { SideNav } from '@/components/layout/side-nav';
import { OnboardingGate } from '@/components/onboarding/onboarding-gate';
import { PwaInstallPrompt } from '@/components/pwa-install-prompt';
import { getCurrentUser } from '@/lib/auth-server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    /*
      Barra de topo como no iOS (`AppTopBar`): voltar + título pequeno em toda
      tela menos o Início, que é a raiz e abre com a saudação. O padding de área
      segura mantém o conteúdo fora do relógio/notch no PWA instalado
      (`black-translucent` + `viewportFit: cover`); a barra cobre essa faixa.

      O menu da IA (ADR 040) e o descanso do treino moram acima das telas: o
      botão da IA abre o menu de qualquer lugar, e a barra do treino em
      andamento mostra o descanso fora da sessão.
    */
    <AiMenuProvider>
      <RestTimerProvider>
        {/* O chat mora aqui, acima de todas as telas: a resposta continua
          chegando enquanto a pessoa navega (ADR 035). */}
        <ChatRuntimeProvider>
          <TopBarProvider>
            {/* A tela que encolhe até o notch quando o menu da IA abre (Al-H6c5).
              A barra de baixo e a lateral ficam fora: a de baixo some, a lateral
              fica parada no desktop. */}
            <AiMenuStage sideNav>
              <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <AppTopBar />
                {/* No desktop o conteúdo fica numa coluna legível, ao lado da `SideNav`. */}
                <main className="flex-1 pt-4 pb-24">
                  <div className="mx-auto w-full max-w-3xl">
                    {children}
                    <BottomSpacer />
                  </div>
                </main>
              </div>
            </AiMenuStage>
            <BottomNav />
            <SideNav />
            <PwaInstallPrompt />
            <OnboardingGate />
            <Toaster />
          </TopBarProvider>
        </ChatRuntimeProvider>
      </RestTimerProvider>
    </AiMenuProvider>
  );
}

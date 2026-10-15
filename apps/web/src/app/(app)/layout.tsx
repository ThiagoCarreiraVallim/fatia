import { Toaster } from '@/components/ui/toaster';
import { redirect } from 'next/navigation';
import { AppTopBar, TopBarProvider } from '@/components/layout/app-top-bar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { QuickAddProvider } from '@/components/layout/quick-add';
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
    */
    <QuickAddProvider>
      <TopBarProvider>
        <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pl-64">
          <AppTopBar />
          {/* No desktop o conteúdo fica numa coluna legível, ao lado da `SideNav`. */}
          <main className="flex-1 pt-4 pb-24">
            <div className="mx-auto w-full max-w-3xl">{children}</div>
          </main>
          <BottomNav />
          <SideNav />
          <PwaInstallPrompt />
          <OnboardingGate />
          <Toaster />
        </div>
      </TopBarProvider>
    </QuickAddProvider>
  );
}

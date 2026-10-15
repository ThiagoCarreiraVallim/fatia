import { redirect } from 'next/navigation';
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
      Sem barra no topo: cada tela já abre com o próprio título, e a marca
      repetida em toda tela só empurrava o conteúdo para baixo. O padding de
      área segura mantém o título fora do relógio/notch no PWA instalado
      (`black-translucent` + `viewportFit: cover`).
    */
    <QuickAddProvider>
      <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:pl-64">
        {/* No desktop o conteúdo fica numa coluna legível, ao lado da `SideNav`. */}
        <main className="flex-1 pt-4 pb-24">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
        <BottomNav />
        <SideNav />
        <PwaInstallPrompt />
        <OnboardingGate />
      </div>
    </QuickAddProvider>
  );
}

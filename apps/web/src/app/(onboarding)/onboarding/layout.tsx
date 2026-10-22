import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth-server';

/**
 * Fora do `(app)`: o assistente de primeira vez não tem barra de navegação —
 * é um caminho só, com "Pular" sempre à mão.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pt-6 pb-10">{children}</main>
    </div>
  );
}

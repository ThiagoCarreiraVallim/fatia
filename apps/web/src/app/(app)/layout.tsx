import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/top-bar';
import { getCurrentUser } from '@/lib/auth-server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar />
      <main className="flex-1 pt-16 pb-24">{children}</main>
      <BottomNav />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { BottomNav } from '@/components/layout/bottom-nav';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token');
  if (!token) return null;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const res = await fetch(`${apiUrl}/api/users/me`, {
      headers: { Cookie: `access_token=${token.value}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
